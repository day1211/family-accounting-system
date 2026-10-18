import { Storage } from './storage.js';

export const Api = {
  isConfigured() {
    const settings = Storage.getSettings();
    return Boolean(settings.gasUrl && settings.gasUrl.startsWith('https://script.google.com/'));
  },

  async callGas(action, payload = {}) {
    const settings = Storage.getSettings();
    if (!settings.gasUrl) {
      throw new Error('尚未設定 Google Sheet API (Apps Script) 網址');
    }

    const body = JSON.stringify({
      passcode: settings.passcode || '',
      action,
      ...payload
    });

    // 使用 text/plain 避免瀏覽器對 Google Apps Script 發出 CORS OPTIONS 預檢請求
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

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || 'Google Sheet 同步失敗，請檢查家庭通行碼是否正確');
    }
    return result;
  },

  /**
   * 完整雙向同步：先沖銷本機離線佇列，再從 Google Sheet 拉取最新全家帳務與設定
   */
  async syncWithCloud() {
    if (!this.isConfigured()) {
      return { synced: false, reason: 'not_configured' };
    }

    // 1. 若有離線期間未同步的操作，先推送至雲端
    const queue = Storage.getPendingQueue();
    if (queue.length > 0) {
      for (const item of queue) {
        try {
          await this.callGas(item.action, item.payload);
        } catch (err) {
          console.warn('Queue item sync warning:', err);
        }
      }
      Storage.savePendingQueue([]);
    }

    // 2. 拉取 Google Sheet 上的完整資料
    const res = await this.callGas('syncAll', {
      localCategories: Storage.getCategories(),
      localMembers: Storage.getMembers(),
      localTemplates: Storage.getTemplates()
    });

    if (Array.isArray(res.transactions)) {
      Storage.saveTransactions(res.transactions);
    }
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

    return { synced: true, data: res };
  },

  async upsertTransaction(tx) {
    if (!this.isConfigured()) return { offline: true };
    try {
      return await this.callGas('upsertTransaction', { transaction: tx });
    } catch (err) {
      const q = Storage.getPendingQueue();
      q.push({ action: 'upsertTransaction', payload: { transaction: tx }, ts: Date.now() });
      Storage.savePendingQueue(q);
      return { offline: true, queued: true, error: err.message };
    }
  },

  async batchInsertTransactions(transactions) {
    if (!this.isConfigured()) return { offline: true };
    try {
      return await this.callGas('batchInsertTransactions', { transactions });
    } catch (err) {
      const q = Storage.getPendingQueue();
      q.push({ action: 'batchInsertTransactions', payload: { transactions }, ts: Date.now() });
      Storage.savePendingQueue(q);
      return { offline: true, queued: true, error: err.message };
    }
  },

  async deleteTransaction(id) {
    if (!this.isConfigured()) return { offline: true };
    try {
      return await this.callGas('deleteTransaction', { id });
    } catch (err) {
      const q = Storage.getPendingQueue();
      q.push({ action: 'deleteTransaction', payload: { id }, ts: Date.now() });
      Storage.savePendingQueue(q);
      return { offline: true, queued: true, error: err.message };
    }
  },

  async syncSettingsToCloud() {
    if (!this.isConfigured()) return { offline: true };
    try {
      return await this.callGas('saveConfig', {
        categories: Storage.getCategories(),
        members: Storage.getMembers(),
        templates: Storage.getTemplates()
      });
    } catch (err) {
      const q = Storage.getPendingQueue();
      q.push({
        action: 'saveConfig',
        payload: {
          categories: Storage.getCategories(),
          members: Storage.getMembers(),
          templates: Storage.getTemplates()
        },
        ts: Date.now()
      });
      Storage.savePendingQueue(q);
      return { offline: true, queued: true, error: err.message };
    }
  }
};
