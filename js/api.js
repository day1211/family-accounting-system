import { Storage } from './storage.js?v=6';

let isSyncingNow = false;

export const Api = {
  isConfigured() {
    const settings = Storage.getSettings();
    return Boolean(settings.gasUrl && settings.gasUrl.startsWith('https://script.google.com/'));
  },

  async callGas(action, payload = {}) {
    const settings = Storage.getSettings();
    if (!settings.gasUrl) {
      throw new Error('尚未設定 Google Sheet API 網址');
    }

    const body = JSON.stringify({
      passcode: settings.passcode || '',
      action,
      ...payload
    });

    const response = await fetch(settings.gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body,
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`雲端連線異常 (HTTP ${response.status})`);
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error('Google Sheet 尚未完成初次權限核准，請先在試算表上方選單點擊一次「初始化」');
    }

    if (!result.ok) {
      throw new Error(result.error || 'Google Sheet 同步失敗');
    }
    return result;
  },

  /**
   * 全自動雙向差異同步引擎 (Smart Two-Way Diff Sync)
   * 1. 將本機已刪除的 ID 同步從 Google Sheet 移除
   * 2. 拉取 Google Sheet 上的所有帳目與本機帳目進行雙向比對：
   *    - 本機有、但雲端沒有的帳目 -> 自動補上傳到 Google Sheet
   *    - 雲端有、但本機沒有的帳目 -> 自動下載合併到本機
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

      // Step 2: 拉取 Google Sheet 目前的完整資料
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
          // 本機有、雲端還沒有 -> 排入自動上傳並保留在合併結果中
          localOnlyToUpload.push(ltx);
          mergedMap.set(idStr, ltx);
        } else {
          // 兩邊都有 -> 比較建立/修改時間，若本機剛修改過則以較新者為準
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
