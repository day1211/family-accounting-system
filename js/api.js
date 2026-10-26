import { Storage } from './storage.js?v=9';

let isSyncingNow = false;

export const Api = {
  isConfigured() {
    const settings = Storage.getSettings();
    const url = settings.gasUrl || Storage.getDefaultGasUrl();
    return Boolean(url && url.startsWith('https://script.google.com/'));
  },

  async callGas(action, payload = {}) {
    const settings = Storage.getSettings();
    const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
    if (!gasUrl) {
      throw new Error('尚未設定 Google Sheet API 網址');
    }

    const passcode = settings.passcode || 'WC-Family-2026';
    const passkeyCredentialId = settings.faceIdCredentialId || 'WC-Authorized-Session';

    // 1. 若為讀取操作 (syncAll / verifyAuth / ensureAnnualSheet)，優先採用標準 GET 請求
    // 這能徹底避開 iOS Standalone PWA (WebKit) 遇到 302 跨網域重導向時拋出「Load failed」的底層 Bug
    if (action === 'syncAll' || action === 'verifyAuth' || action === 'ensureAnnualSheet') {
      const url = new URL(gasUrl);
      url.searchParams.set('action', action);
      url.searchParams.set('passcode', passcode);
      url.searchParams.set('passkeyCredentialId', passkeyCredentialId);
      url.searchParams.set('t', Date.now().toString());
      if (payload.year) url.searchParams.set('year', payload.year);

      const res = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store'
      });

      if (!res.ok) {
        throw new Error(`雲端連線異常 (HTTP ${res.status})`);
      }

      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const preview = String(text || '').slice(0, 80).replace(/\s+/g, ' ');
        throw new Error(`雲端回應格式異常 (${preview || '空內容'})`);
      }

      if (!parsed.ok) {
        throw new Error(parsed.error || 'Google Sheet 同步失敗');
      }
      return parsed;
    }

    // 2. 若為寫入操作 (新增/修改/刪除帳目)，優先以 POST 傳送；若遇 iOS WebKit Standalone 的 Load failed，自動降級以 GET 資料通道送達
    const bodyObj = {
      passcode,
      passkeyCredentialId,
      action,
      ...payload
    };

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(bodyObj),
        redirect: 'follow',
        cache: 'no-store'
      });

      if (response.ok) {
        const text = await response.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          const preview = String(text || '').slice(0, 80).replace(/\s+/g, ' ');
          throw new Error(`雲端回應格式異常 (${preview || '空內容'})`);
        }
        if (parsed.ok) return parsed;
        throw new Error(parsed.error || 'Google Sheet 同步失敗');
      }
    } catch (postErr) {
      // 容錯降級：以 GET 攜帶 JSON 資料送達 Google Apps Script
      try {
        const fallbackUrl = new URL(gasUrl);
        fallbackUrl.searchParams.set('action', action);
        fallbackUrl.searchParams.set('passcode', passcode);
        fallbackUrl.searchParams.set('data', JSON.stringify(payload));
        fallbackUrl.searchParams.set('t', Date.now().toString());

        const resFallback = await fetch(fallbackUrl.toString(), {
          method: 'GET',
          cache: 'no-store'
        });

        if (resFallback.ok) {
          const text = await resFallback.text();
          const parsed = JSON.parse(text);
          if (parsed && parsed.ok) return parsed;
        }
      } catch {}
      throw postErr;
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

      // Step 2: 拉取 Google Sheet 目前的完整資料 (以 iOS 安全之 GET 模式傳輸)
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
