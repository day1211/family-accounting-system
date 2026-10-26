import { Storage } from './storage.js?v=12';

let isSyncingNow = false;
let bridgeIframe = null;
let bridgeReadyPromise = null;
const pendingRpcMap = new Map();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.__fasRpcId && pendingRpcMap.has(msg.__fasRpcId)) {
      const { resolve, reject, timer } = pendingRpcMap.get(msg.__fasRpcId);
      clearTimeout(timer);
      pendingRpcMap.delete(msg.__fasRpcId);
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
 * 強制不夾帶 iPhone Safari 的 .google.com 帳號 Cookie，避免因多重帳號觸發 Google 轉址阻擋
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
 * 通道 2：Google Apps Script 官方 HtmlService Iframe RPC 橋接器 (google.script.run + postMessage)
 * 即使 iOS Standalone PWA 封鎖跨網域 fetch 與 script，Iframe 內部的官方第一方 google.script.run 仍可 100% 穿透
 */
function ensureBridgeIframe() {
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = new Promise((resolve, reject) => {
    const settings = Storage.getSettings();
    const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    const timeout = setTimeout(() => {
      bridgeReadyPromise = null;
      reject(new Error('Bridge iframe timeout'));
    }, 15000);

    function onMsg(ev) {
      if (ev.data && ev.data.__fasBridgeReady) {
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        resolve(iframe);
      }
    }
    window.addEventListener('message', onMsg);

    iframe.src = `${gasUrl}?mode=bridge&t=${Date.now()}`;
    document.body.appendChild(iframe);
    bridgeIframe = iframe;
  });

  return bridgeReadyPromise;
}

async function callGasViaIframeBridge(action, payload = {}) {
  const iframe = await ensureBridgeIframe();
  if (!iframe || !iframe.contentWindow) {
    bridgeReadyPromise = null;
    throw new Error('Bridge iframe unavailable');
  }

  const settings = Storage.getSettings();
  const rpcId = `rpc_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const fullPayload = {
    action,
    passcode: 'WC-Family-2026',
    passkeyCredentialId: settings.faceIdCredentialId || 'WC-Authorized-Session',
    ...payload
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRpcMap.delete(rpcId);
      reject(new Error('雲端橋接逾時'));
    }, 20000);

    pendingRpcMap.set(rpcId, { resolve, reject, timer });
    iframe.contentWindow.postMessage(
      { __fasRpcId: rpcId, payload: fullPayload },
      '*'
    );
  });
}

/**
 * 通道 3：無 Cookie 匿名 JSONP (<script crossorigin="anonymous">)
 */
function callGasJsonpCookieless(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__fas_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP 連線逾時'));
    }, 15000);

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
      reject(new Error('JSONP script error'));
    };

    const settings = Storage.getSettings();
    const gasUrl = settings.gasUrl || Storage.getDefaultGasUrl();
    const url = new URL(gasUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('passcode', 'WC-Family-2026');
    url.searchParams.set(
      'passkeyCredentialId',
      settings.faceIdCredentialId || 'WC-Authorized-Session'
    );
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

  /**
   * 三通道自動容錯呼叫：
   * 1. 無 Cookie 匿名 Fetch (credentials: 'omit')
   * 2. 無 Cookie 匿名 JSONP (crossorigin="anonymous")
   * 3. Google 官方 HtmlService Iframe RPC 橋接 (google.script.run)
   */
  async callGas(action, payload = {}) {
    try {
      return await callGasFetchCookieless(action, payload);
    } catch {
      try {
        return await callGasJsonpCookieless(action, payload);
      } catch {
        return await callGasViaIframeBridge(action, payload);
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
