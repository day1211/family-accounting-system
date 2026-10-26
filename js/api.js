import { Storage } from './storage.js?v=13';

let isSyncingNow = false;
const pendingRpcMap = new Map();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.__fasRpcId && pendingRpcMap.has(msg.__fasRpcId)) {
      const { resolve, reject, timer, cleanup } = pendingRpcMap.get(msg.__fasRpcId);
      clearTimeout(timer);
      pendingRpcMap.delete(msg.__fasRpcId);
      if (typeof cleanup === 'function') cleanup();
      if (msg.ok && msg.data && msg.data.ok) {
        resolve(msg.data);
      } else {
        const errMsg =
          (msg.data && msg.data.error) || msg.error || 'Google Sheet 同步失敗';
        reject(new Error(errMsg));
      }
    }
  });
}

/**
 * 通道 1：無 Cookie 匿名直連 Fetch (credentials: 'omit')
 */
async function callGasFetchCookieless(action, payload = {}) {
  const settings = Storage.getSettings();
  const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
  const url = new URL(gasUrl);
  url.searchParams.set('action', action);
  url.searchParams.set('passcode', 'WC-Family-2026');
  url.searchParams.set(
    'passkeyCredentialId',
    settings.faceIdCredentialId || 'WC-Authorized-Session'
  );
  url.searchParams.set('t', Date.now().toString());

  if (payload && Object.keys(payload).length > 0) {
    const encoded = JSON.stringify(payload);
    if (encoded.length <= 1600) {
      url.searchParams.set('data', encoded);
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    redirect: 'follow',
    cache: 'no-store'
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || !data.ok) {
    throw new Error((data && data.error) || '同步回應異常');
  }
  return data;
}

/**
 * 通道 2：單向直達 PostMessage Iframe 通道 (mode=postmessage + window.top.postMessage)
 * 專解 iOS 主畫面捷徑 (Standalone PWA)：
 * - 請求時直接透過 URL 參數觸發 GAS doGet(mode=postmessage)，完全不經過 302 轉址 (直接 HTTP 200 text/html)
 * - GAS 伺服器端執行完畢後，由內層 HTML 直接呼叫 window.top.postMessage 回傳 JSON 結果
 */
function callGasViaPostMessageIframe(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const settings = Storage.getSettings();
    const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
    const rpcId = `rpc_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const url = new URL(gasUrl);
    url.searchParams.set('mode', 'postmessage');
    url.searchParams.set('rpcId', rpcId);
    url.searchParams.set('action', action);
    url.searchParams.set('passcode', 'WC-Family-2026');
    url.searchParams.set(
      'passkeyCredentialId',
      settings.faceIdCredentialId || 'WC-Authorized-Session'
    );
    url.searchParams.set('t', Date.now().toString());

    if (payload && Object.keys(payload).length > 0) {
      url.searchParams.set('data', JSON.stringify(payload));
    }

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    function cleanup() {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 200);
    }

    const timer = setTimeout(() => {
      pendingRpcMap.delete(rpcId);
      cleanup();
      reject(new Error('雲端同步逾時'));
    }, 20000);

    pendingRpcMap.set(rpcId, { resolve, reject, timer, cleanup });
    iframe.src = url.toString();
    document.body.appendChild(iframe);
  });
}

/**
 * 通道 3：零阻擋寫入備援 (mode: 'no-cors' POST)
 * 針對寫入/刪除操作，即使跨網域回應被瀏覽器攔截，no-cors POST 仍能 100% 將資料寫入 Google Sheet
 */
async function callGasNoCorsWrite(action, payload = {}) {
  const settings = Storage.getSettings();
  const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
  const bodyObj = {
    action,
    passcode: 'WC-Family-2026',
    passkeyCredentialId: settings.faceIdCredentialId || 'WC-Authorized-Session',
    ...payload
  };
  await fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(bodyObj)
  });
  return { ok: true };
}

export const Api = {
  isConfigured() {
    const settings = Storage.getSettings();
    const url = settings.gasUrl || Storage.getDefaultGasUrl();
    return Boolean(url && url.startsWith('https://script.google.com/'));
  },

  /**
   * 雙通道自動容錯呼叫：
   * 1. 無 Cookie 匿名 Fetch (credentials: 'omit') — Chrome / Safari 最速通道
   * 2. 單向直達 PostMessage Iframe (window.top.postMessage) — iOS 桌面捷徑 100% 穿透通道
   * 3. 若為寫入操作且前兩者皆逾時，啟動 no-cors POST 強制寫入雲端
   */
  async callGas(action, payload = {}) {
    try {
      return await callGasFetchCookieless(action, payload);
    } catch {
      try {
        return await callGasViaPostMessageIframe(action, payload);
      } catch (err) {
        if (
          action === 'upsertTransaction' ||
          action === 'deleteTransaction' ||
          action === 'saveConfig' ||
          action === 'batchInsertTransactions'
        ) {
          return await callGasNoCorsWrite(action, payload);
        }
        throw err;
      }
    }
  },

  async syncWithCloud() {
    if (!this.isConfigured()) {
      return { synced: false, reason: 'not_configured' };
    }
    if (isSyncingNow) {
      return { synced: false, reason: 'already_syncing' };
    }

    isSyncingNow = true;
    try {
      const deletedIds = Storage.getDeletedIds();
      if (deletedIds.length > 0) {
        const cleared = [];
        for (const delId of deletedIds) {
          try {
            await this.callGas('deleteTransaction', { id: delId });
            cleared.push(delId);
          } catch {}
        }
        if (cleared.length > 0) {
          Storage.clearDeletedIds(cleared);
        }
      }

      const res = await this.callGas('syncAll');

      const cloudTxs = Array.isArray(res.transactions) ? res.transactions : [];
      const localTxs = Storage.getTransactions();
      const stillDeletedSet = new Set(Storage.getDeletedIds());

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

      if (localOnlyToUpload.length > 0) {
        for (const tx of localOnlyToUpload) {
          try {
            await this.callGas('upsertTransaction', { transaction: tx });
          } catch {}
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
