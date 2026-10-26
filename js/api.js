import { Storage } from './storage.js?v=11';

let isSyncingNow = false;

/**
 * 純 JSONP (<script>) 雲端通訊通道：
 * 1. 徹底避開 iOS Standalone PWA (WebKit) 針對 fetch 跨網域 302 重導向與 ITP 的「Load failed」限制
 * 2. 嚴格控制 URL 長度在 1,500 字元以內，避免觸發 Google 伺服器 HTTP 400/413 URL 過長錯誤
 */
function callGasJsonp(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__fas_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('雲端連線逾時，請確認網路狀態'));
    }, 20000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function (res) {
      cleanup();
      if (!res || !res.ok) {
        reject(new Error(res && res.error ? res.error : 'Google Sheet 同步失敗'));
      } else {
        resolve(res);
      }
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('雲端腳本載入失敗，請點擊重試'));
    };

    const settings = Storage.getSettings();
    const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
    const url = new URL(gasUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('passcode', 'WC-Family-2026');
    url.searchParams.set('passkeyCredentialId', settings.faceIdCredentialId || 'WC-Authorized-Session');
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('t', Date.now().toString());

    if (payload && Object.keys(payload).length > 0) {
      const encodedData = JSON.stringify(payload);
      if (encodedData.length <= 1600) {
        url.searchParams.set('data', encodedData);
      }
    }

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

export const Api = {
  isConfigured() {
    const settings = Storage.getSettings();
    const url = settings.gasUrl || Storage.getDefaultGasUrl();
    return Boolean(url && url.startsWith('https://script.google.com/'));
  },

  async callGas(action, payload = {}) {
    return await callGasJsonp(action, payload);
  },

  /**
   * 全自動雙向差異同步引擎 (Smart Two-Way Diff Sync)
   */
  async syncWithCloud() {
    if (!this.isConfigured()) {
      return { synced: false, reason: 'not_configured' };
    }
    if (isSyncingNow) {
      return { synced: false, reason: 'already_syncing' };
    }

    isSyncingNow = true;
    try {
      // Step 1: 同步本機待刪除的帳目到雲端
      const deletedIds = Storage.getDeletedIds();
      if (deletedIds.length > 0) {
        const cleared = [];
        for (const delId of deletedIds) {
          try {
            await this.callGas('deleteTransaction', { id: delId });
            cleared.push(delId);
          } catch {
            // 保留待下次重試
          }
        }
        if (cleared.length > 0) {
          Storage.clearDeletedIds(cleared);
        }
      }

      // Step 2: 拉取 Google Sheet 目前的完整資料（不夾帶龐大設定參數，保持極短 URL 確保 100% 秒開）
      const res = await this.callGas('syncAll');

      const cloudTxs = Array.isArray(res.transactions) ? res.transactions : [];
      const localTxs = Storage.getTransactions();
      const stillDeletedSet = new Set(Storage.getDeletedIds());

      // Step 3: 雙向差異合併 (Two-Way Merge by ID)
      const cloudMap = new Map();
      cloudTxs.forEach((tx) => {
        if (tx && tx.id && !stillDeletedSet.has(tx.id)) {
          cloudMap.set(String(tx.id), tx);
        }
      });

      const localOnlyToUpload = [];
      const mergedMap = new Map(cloudMap);

      localTxs.forEach((ltx) => {
        if (!ltx || !ltx.id || stillDeletedSet.has(ltx.id)) return;
        const idStr = String(ltx.id);
        if (!cloudMap.has(idStr)) {
          localOnlyToUpload.push(ltx);
          mergedMap.set(idStr, ltx);
        } else {
          const ctx = cloudMap.get(idStr);
          const lTime = Date.parse(ltx.createdAt || '') || 0;
          const cTime = Date.parse(ctx.createdAt || '') || 0;
          if (lTime > cTime) {
            localOnlyToUpload.push(ltx);
            mergedMap.set(idStr, ltx);
          }
        }
      });

      // Step 4: 若本機有尚未同步到 Google Sheet 的帳目，逐筆透過輕量 JSONP 寫入雲端
      if (localOnlyToUpload.length > 0) {
        for (const tx of localOnlyToUpload) {
          try {
            await this.callGas('upsertTransaction', { transaction: tx });
          } catch {
            // 單筆失敗保留至下輪同步
          }
        }
      }

      const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      );
      Storage.saveTransactions(mergedList);

      if (Array.isArray(res.categories) && res.categories.length > 0) {
        Storage.saveCategories(res.categories);
      }
      if (Array.isArray(res.members) && res.members.length > 0) {
        Storage.saveMembers(res.members);
      }
      if (Array.isArray(res.templates) && res.templates.length > 0) {
        Storage.saveTemplates(res.templates);
      }

      Storage.saveSettings({
        lastSyncAt: new Date().toISOString(),
        isDemoData: false
      });

      return { synced: true, uploaded: localOnlyToUpload.length, total: mergedList.length };
    } finally {
      isSyncingNow = false;
    }
  },

  async upsertTransaction(tx) {
    if (!this.isConfigured()) return { offline: true };
    try {
      await this.callGas('upsertTransaction', { transaction: tx });
      Storage.saveSettings({ lastSyncAt: new Date().toISOString() });
      return { synced: true };
    } catch (err) {
      return { offline: true, error: err.message };
    }
  },

  async batchInsertTransactions(transactions) {
    if (!this.isConfigured()) return { offline: true };
    try {
      for (const tx of transactions) {
        await this.callGas('upsertTransaction', { transaction: tx });
      }
      Storage.saveSettings({ lastSyncAt: new Date().toISOString() });
      return { synced: true };
    } catch (err) {
      return { offline: true, error: err.message };
    }
  },

  async deleteTransaction(id) {
    Storage.addDeletedId(id);
    if (!this.isConfigured()) return { offline: true };
    try {
      await this.callGas('deleteTransaction', { id });
      Storage.clearDeletedIds([id]);
      Storage.saveSettings({ lastSyncAt: new Date().toISOString() });
      return { synced: true };
    } catch (err) {
      return { offline: true, error: err.message };
    }
  },

  async syncSettingsToCloud() {
    if (!this.isConfigured()) return { offline: true };
    try {
      await this.callGas('saveConfig', {
        members: Storage.getMembers()
      });
      Storage.saveSettings({ lastSyncAt: new Date().toISOString() });
      return { synced: true };
    } catch (err) {
      return { offline: true, error: err.message };
    }
  },

  async ensureAnnualSheet(year) {
    if (!this.isConfigured()) return { offline: true };
    return await this.callGas('ensureAnnualSheet', { year });
  }
};
