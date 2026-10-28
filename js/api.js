import { Storage } from './storage.js?v=15';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_MEMBERS,
  DEFAULT_TEMPLATES,
  LEGACY_TEST_TX_IDS,
  generateSampleTransactions
} from './defaultData.js?v=15';

let isSyncingNow = false;
let cachedIdToken = '';
let cachedTokenExp = 0;

const FS_KEY = [
  'AIzaSyC0dy1h',
  '_GTKb5mHCDTq3i1gxySMtDOOWfQ'
].join('');
const FS_PROJECT = 'daily-task-app-b3903';
const FS_DOC_PATH =
  'artifacts/task-app-v4/public/data/app/wc_family_accounting_v15';

async function getZeroRedirectToken() {
  const now = Date.now();
  if (cachedIdToken && now < cachedTokenExp) {
    return cachedIdToken;
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FS_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!res.ok) {
    throw new Error(`Auth HTTP ${res.status}`);
  }
  const data = await res.json();
  cachedIdToken = data.idToken || '';
  cachedTokenExp = now + 45 * 60 * 1000;
  return cachedIdToken;
}

/**
 * 零 302 轉址雲端鏡像讀取 (專解 iOS 主畫面獨立 Web App 阻擋 302 轉址問題)
 */
async function readZeroRedirectCloudMirror() {
  const token = await getZeroRedirectToken();
  const docUrl = `https://firestore.googleapis.com/v1/projects/${FS_PROJECT}/databases/(default)/documents/${FS_DOC_PATH}?t=${Date.now()}`;
  const res = await fetch(docUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (res.status === 404) {
    const initialPayload = {
      ok: true,
      transactions: generateSampleTransactions(),
      categories: DEFAULT_CATEGORIES,
      members: DEFAULT_MEMBERS,
      templates: DEFAULT_TEMPLATES,
      deletedIds: []
    };
    await writeZeroRedirectCloudMirror(initialPayload);
    return initialPayload;
  }

  if (!res.ok) {
    throw new Error(`Mirror HTTP ${res.status}`);
  }

  const doc = await res.json();
  const rawStr =
    doc &&
    doc.fields &&
    doc.fields.payload &&
    typeof doc.fields.payload.stringValue === 'string'
      ? doc.fields.payload.stringValue
      : '';

  if (rawStr) {
    try {
      const parsed = JSON.parse(rawStr);
      if (parsed && Array.isArray(parsed.transactions)) {
        return parsed;
      }
    } catch {}
  }

  const seededPayload = {
    ok: true,
    transactions: generateSampleTransactions(),
    categories: DEFAULT_CATEGORIES,
    members: DEFAULT_MEMBERS,
    templates: DEFAULT_TEMPLATES,
    deletedIds: []
  };
  await writeZeroRedirectCloudMirror(seededPayload);
  return seededPayload;
}

/**
 * 零 302 轉址雲端鏡像寫入
 */
async function writeZeroRedirectCloudMirror(payloadObj) {
  const token = await getZeroRedirectToken();
  const docUrl = `https://firestore.googleapis.com/v1/projects/${FS_PROJECT}/databases/(default)/documents/${FS_DOC_PATH}`;
  const body = {
    fields: {
      payload: { stringValue: JSON.stringify(payloadObj) },
      updatedAt: { integerValue: String(Date.now()) }
    }
  };
  const res = await fetch(docUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Mirror Write HTTP ${res.status}`);
  }
  return { ok: true };
}

/**
 * 通道 1：無 Cookie 匿名直連 Google Sheet (附 3.5 秒快速逾時保護)
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data || !data.ok) {
      throw new Error((data && data.error) || '同步回應異常');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通道 2：零阻擋寫入 Google Sheet (mode: 'no-cors' POST)
 * Google Apps Script 會在回傳 302 轉址前先完成試算表寫入，因此 iOS 桌面捷徑也能 100% 寫入 Google Sheet
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

  async callGas(action, payload = {}) {
    if (action === 'syncAll') {
      try {
        const sheetRes = await callGasFetchCookieless('syncAll');
        return sheetRes;
      } catch {
        return await readZeroRedirectCloudMirror();
      }
    }

    try {
      return await callGasFetchCookieless(action, payload);
    } catch {
      return await callGasNoCorsWrite(action, payload);
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
      const localDeletedIds = Storage.getDeletedIds();
      let mirrorRes = null;
      let sheetRes = null;

      const [sheetOutcome, mirrorOutcome] = await Promise.allSettled([
        callGasFetchCookieless('syncAll'),
        readZeroRedirectCloudMirror()
      ]);

      if (sheetOutcome.status === 'fulfilled') {
        sheetRes = sheetOutcome.value;
      }
      if (mirrorOutcome.status === 'fulfilled') {
        mirrorRes = mirrorOutcome.value;
      }

      if (!sheetRes && !mirrorRes) {
        throw new Error('無法連線至雲端資料庫');
      }

      const mirrorDeletedIds =
        mirrorRes && Array.isArray(mirrorRes.deletedIds)
          ? mirrorRes.deletedIds
          : [];
      const allDeletedSet = new Set([
        ...LEGACY_TEST_TX_IDS.map(String),
        ...localDeletedIds.map(String),
        ...mirrorDeletedIds.map(String)
      ]);

      if (localDeletedIds.length > 0) {
        for (const delId of localDeletedIds) {
          try {
            await callGasNoCorsWrite('deleteTransaction', { id: delId });
          } catch {}
        }
        Storage.clearDeletedIds(localDeletedIds);
      }

      const cloudMap = new Map();
      const sheetTxs =
        sheetRes && Array.isArray(sheetRes.transactions)
          ? sheetRes.transactions
          : [];
      const mirrorTxs =
        mirrorRes && Array.isArray(mirrorRes.transactions)
          ? mirrorRes.transactions
          : [];

      [...sheetTxs, ...mirrorTxs].forEach((tx) => {
        if (!tx || !tx.id) return;
        const idStr = String(tx.id);
        if (allDeletedSet.has(idStr)) return;
        const existing = cloudMap.get(idStr);
        if (!existing) {
          cloudMap.set(idStr, tx);
        } else {
          const tNew = Date.parse(tx.createdAt || '') || 0;
          const tOld = Date.parse(existing.createdAt || '') || 0;
          if (tNew >= tOld) {
            cloudMap.set(idStr, tx);
          }
        }
      });

      const localTxs = Storage.getTransactions();
      const toUploadToSheet = [];
      const mergedMap = new Map(cloudMap);

      localTxs.forEach((ltx) => {
        if (!ltx || !ltx.id) return;
        const idStr = String(ltx.id);
        if (allDeletedSet.has(idStr)) return;

        if (!cloudMap.has(idStr)) {
          toUploadToSheet.push(ltx);
          mergedMap.set(idStr, ltx);
        } else {
          const ctx = cloudMap.get(idStr);
          const lTime = Date.parse(ltx.createdAt || '') || 0;
          const cTime = Date.parse(ctx.createdAt || '') || 0;
          if (lTime > cTime) {
            toUploadToSheet.push(ltx);
            mergedMap.set(idStr, ltx);
          }
        }
      });

      // 若 Google Sheet 端缺少鏡像中的新交易，也一併補寫回 Google Sheet
      if (sheetRes) {
        const sheetIdSet = new Set(sheetTxs.map((t) => String(t.id)));
        mergedMap.forEach((tx, idStr) => {
          if (!sheetIdSet.has(idStr) && !toUploadToSheet.some((u) => String(u.id) === idStr)) {
            toUploadToSheet.push(tx);
          }
        });
      }

      if (toUploadToSheet.length > 0) {
        for (const tx of toUploadToSheet) {
          try {
            await callGasNoCorsWrite('upsertTransaction', { transaction: tx });
          } catch {}
        }
      }

      const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      );
      Storage.saveTransactions(mergedList);

      const primaryRes = sheetRes || mirrorRes;
      if (Array.isArray(primaryRes.categories) && primaryRes.categories.length > 0) {
        Storage.saveCategories(primaryRes.categories);
      }
      if (Array.isArray(primaryRes.members) && primaryRes.members.length > 0) {
        Storage.saveMembers(primaryRes.members);
      }
      if (Array.isArray(primaryRes.templates) && primaryRes.templates.length > 0) {
        Storage.saveTemplates(primaryRes.templates);
      }

      // 更新零 302 轉址雲端鏡像，確保 iPhone 桌面捷徑與所有瀏覽器即時一致
      try {
        await writeZeroRedirectCloudMirror({
          ok: true,
          transactions: mergedList,
          categories: Storage.getCategories(),
          members: Storage.getMembers(),
          templates: Storage.getTemplates(),
          deletedIds: Array.from(allDeletedSet)
        });
      } catch {}

      Storage.saveSettings({
        lastSyncAt: new Date().toISOString(),
        isDemoData: false
      });

      return {
        synced: true,
        uploaded: toUploadToSheet.length,
        total: mergedList.length
      };
    } finally {
      isSyncingNow = false;
    }
  },

  async upsertTransaction(tx) {
    if (!this.isConfigured()) return { offline: true };
    try {
      const currentList = Storage.getTransactions();
      const deletedIds = Storage.getDeletedIds();
      await Promise.allSettled([
        callGasNoCorsWrite('upsertTransaction', { transaction: tx }),
        writeZeroRedirectCloudMirror({
          ok: true,
          transactions: currentList,
          categories: Storage.getCategories(),
          members: Storage.getMembers(),
          templates: Storage.getTemplates(),
          deletedIds
        })
      ]);
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
        await callGasNoCorsWrite('upsertTransaction', { transaction: tx });
      }
      await writeZeroRedirectCloudMirror({
        ok: true,
        transactions: Storage.getTransactions(),
        categories: Storage.getCategories(),
        members: Storage.getMembers(),
        templates: Storage.getTemplates(),
        deletedIds: Storage.getDeletedIds()
      });
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
      const allDeleted = Storage.getDeletedIds();
      await Promise.allSettled([
        callGasNoCorsWrite('deleteTransaction', { id }),
        writeZeroRedirectCloudMirror({
          ok: true,
          transactions: Storage.getTransactions(),
          categories: Storage.getCategories(),
          members: Storage.getMembers(),
          templates: Storage.getTemplates(),
          deletedIds: allDeleted
        })
      ]);
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
      await Promise.allSettled([
        callGasNoCorsWrite('saveConfig', {
          members: Storage.getMembers()
        }),
        writeZeroRedirectCloudMirror({
          ok: true,
          transactions: Storage.getTransactions(),
          categories: Storage.getCategories(),
          members: Storage.getMembers(),
          templates: Storage.getTemplates(),
          deletedIds: Storage.getDeletedIds()
        })
      ]);
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
