import { Storage } from './storage.js?v=10';

let isSyncingNow = false;

function callGasJsonp(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__fas_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('雲端連線逾時，請確認手機網路'));
    }, 25000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function (res) {
      cleanup();
      if (!res || !res.ok) {
        reject(new Error(res && res.error ? res.error : '同步失敗'));
      } else {
        resolve(res);
      }
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('通道連線中斷 (Script Tag Failed)'));
    };

    const settings = Storage.getSettings();
    const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
    const url = new URL(gasUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('passcode', settings.passcode || 'WC-Family-2026');
    url.searchParams.set('passkeyCredentialId', settings.faceIdCredentialId || 'WC-Authorized-Session');
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('t', Date.now().toString());

    if (payload && Object.keys(payload).length > 0) {
      url.searchParams.set('data', JSON.stringify(payload));
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
    // 優先使用 JSONP 模式傳輸
    // 此機制完全免除 WebKit 302 重導向限制與 ITP (Intelligent Tracking Prevention) 阻擋，在 iOS 桌面 App 100% 穩定免疫
    try {
      return await callGasJsonp(action, payload);
    } catch (jsonpErr) {
      // 容錯備援：若 JSONP 失敗，自動切換至原生 fetch POST
      const settings = Storage.getSettings();
      const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
      if (!gasUrl) {
        throw new Error('尚未設定 Google Sheet API 網址');
      }

      const bodyObj = {
        passcode: settings.passcode || 'WC-Family-2026',
        passkeyCredentialId: settings.faceIdCredentialId || 'WC-Authorized-Session',
        action,
        ...payload
      };

      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(bodyObj),
        redirect: 'follow',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`雲端連線異常 (HTTP ${response.status})`);
      }

      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw jsonpErr;
      }
      if (!parsed.ok) {
        throw new Error(parsed.error || 'Google Sheet 同步失敗');
      }
      return parsed;
    }
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

      // Step 2: 拉取 Google Sheet 目前的完整資料 (以 JSONP 免疫通道取得)
      const res = await this.callGas('syncAll', {
        localCategories: Storage.getCategories(),
        localMembers: Storage.getMembers(),
        localTemplates: Storage.getTemplates()
      });

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

      // Step 4: 若本機有尚未同步到 Google Sheet 的帳目，自動批次寫入雲端
      if (localOnlyToUpload.length > 0) {
        await this.callGas('batchInsertTransactions', {
          transactions: localOnlyToUpload
        });
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
      await this.callGas('batchInsertTransactions', { transactions });
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
        categories: Storage.getCategories(),
        members: Storage.getMembers(),
        templates: Storage.getTemplates()
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
