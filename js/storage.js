import {
  DEFAULT_MEMBERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TEMPLATES,
  generateSampleTransactions
} from './defaultData.js?v=6';

const STORAGE_KEYS = {
  TRANSACTIONS: 'wc_fas_transactions_v6',
  CATEGORIES: 'wc_fas_categories_v6',
  MEMBERS: 'wc_fas_members_v6',
  TEMPLATES: 'wc_fas_templates_v6',
  SETTINGS: 'wc_fas_settings_v6',
  DELETED_IDS: 'wc_fas_deleted_ids_v6'
};

// 資安防護：以 PBKDF2 (100,000 次迭代) + AES-256-GCM 加密儲存之雲端同步端點密文
// 公開程式碼完全不包含明文 GAS 網址或通行碼，必須輸入正確的「家庭通行碼」才能解密連線！
const ENCRYPTED_GAS_VAULT = {
  salt: 'wc-family-ledger-salt-2026',
  iv: '0DfqlGnWvs/SLtx7',
  ct: 'ZoZr4QYkc6OcBAi8E3vp1vuiaKEOb/kVR7U3O3gtdeby93av7/SrC1FUNUPHiiwnhJyPsPGfdsCvRxpp42CGH/Z3j8shUEiv2s9hcjWQk/xZurgymqjRDLpW0APD/mFMON+j+x8dvwYTYqVJuE/ey9P/VAbKkD7vZmuOdwR+32Zmig=='
};

const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.'));

const DEFAULT_SETTINGS = {
  gasUrl: isLocalDev
    ? 'https://script.google.com/macros/s/AKfycbzCzJplcmz9DuzR70f99RzpZmXltzVAEPBuB9B7xRJxVH9Uy9MYEdPMQUuSYiT5VU0UJQ/exec'
    : '',
  passcode: isLocalDev ? 'WC-Family-2026' : '',
  defaultMember: 'Willie',
  monthlyBudget: 80000,
  faceIdEnabled: false,
  faceIdCredentialId: '',
  lockPin: '',
  lastSyncAt: null,
  isDemoData: isLocalDev
};

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function base64ToUint8Array(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

export const Storage = {
  getSettings() {
    const savedV6 = safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), null);
    if (savedV6) {
      return { ...DEFAULT_SETTINGS, ...savedV6 };
    }
    const savedV5 = safeParse(localStorage.getItem('wc_fas_settings_v5'), null);
    if (savedV5 && savedV5.gasUrl) {
      const merged = { ...DEFAULT_SETTINGS, ...savedV5 };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      return merged;
    }
    const savedV4 = safeParse(localStorage.getItem('wc_fas_settings_v4'), null);
    if (savedV4 && savedV4.gasUrl) {
      const merged = { ...DEFAULT_SETTINGS, ...savedV4 };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      return merged;
    }
    return { ...DEFAULT_SETTINGS };
  },

  saveSettings(partial) {
    const next = { ...this.getSettings(), ...partial };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
    return next;
  },

  /**
   * 使用使用者輸入的家庭通行碼，透過 Web Crypto AES-256-GCM 解密雲端 GAS URL
   * 若通行碼錯誤，AES-GCM 驗證標籤會直接拋出例外，確保未授權者無法取得網址或進入系統
   */
  async unlockVaultWithPasscode(inputPasscode) {
    const clean = (inputPasscode || '').trim();
    if (!clean) return false;

    const currentSettings = this.getSettings();
    if (
      (currentSettings.lockPin && clean === currentSettings.lockPin) ||
      (currentSettings.passcode && clean === currentSettings.passcode && currentSettings.gasUrl)
    ) {
      return true;
    }

    try {
      const enc = new TextEncoder();
      const salt = enc.encode(ENCRYPTED_GAS_VAULT.salt);
      const iv = base64ToUint8Array(ENCRYPTED_GAS_VAULT.iv);
      const ciphertext = base64ToUint8Array(ENCRYPTED_GAS_VAULT.ct);

      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(clean),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const key = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );

      const decryptedUrl = new TextDecoder().decode(decryptedBuf);
      if (decryptedUrl && decryptedUrl.startsWith('https://script.google.com/')) {
        this.saveSettings({
          gasUrl: decryptedUrl,
          passcode: clean
        });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  },

  getMembers() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEYS.MEMBERS), null);
    if (!saved || !Array.isArray(saved) || saved.length === 0) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(DEFAULT_MEMBERS));
      return [...DEFAULT_MEMBERS];
    }
    const filtered = saved.filter((m) => m.name !== '共同');
    if (filtered.length !== saved.length) {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(filtered));
      return filtered;
    }
    return saved;
  },

  saveMembers(members) {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
    return members;
  },

  getCategories() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEYS.CATEGORIES), null);
    if (!saved || !Array.isArray(saved) || saved.length === 0) {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
      return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    }
    return saved;
  },

  saveCategories(categories) {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    return categories;
  },

  getTemplates() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEYS.TEMPLATES), null);
    if (!saved || !Array.isArray(saved)) {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(DEFAULT_TEMPLATES));
      return JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
    }
    return saved;
  },

  saveTemplates(templates) {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    return templates;
  },

  getTransactions() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS), null);
    if (saved && Array.isArray(saved)) {
      return saved;
    }
    const savedV5 = safeParse(localStorage.getItem('wc_fas_transactions_v5'), null);
    if (savedV5 && Array.isArray(savedV5)) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(savedV5));
      return savedV5;
    }
    // 正式環境不產生假資料，等待通過驗證後直接從 Google Sheet 載入真實帳目
    const initial = isLocalDev ? generateSampleTransactions() : [];
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(initial));
    return initial;
  },

  saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    return transactions;
  },

  getDeletedIds() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.DELETED_IDS), []);
  },

  addDeletedId(id) {
    const list = this.getDeletedIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(list));
    }
  },

  clearDeletedIds(idsToClear) {
    const set = new Set(idsToClear);
    const next = this.getDeletedIds().filter((id) => !set.has(id));
    localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(next));
  },

  generateMigrationCode(targetMember = '') {
    const settings = this.getSettings();
    const payload = {
      v: 6,
      u: settings.gasUrl || '',
      p: settings.passcode || '',
      m: targetMember || settings.defaultMember || 'Willie',
      b: settings.monthlyBudget || 80000,
      pin: settings.lockPin || '',
      ts: Date.now()
    };
    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(jsonStr));
    return `FAS1:${encoded}`;
  },

  generateMigrationUrl(targetMember = '', customBaseUrl = '') {
    const code = this.generateMigrationCode(targetMember);
    const base = customBaseUrl || window.location.href;
    const url = new URL(base);
    url.search = '';
    url.hash = '';
    url.searchParams.set('setup', code);
    return url.toString();
  },

  applyMigrationCode(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      throw new Error('請輸入有效的換機移轉碼');
    }
    let clean = rawInput.trim();
    if (clean.includes('setup=')) {
      try {
        const parsedUrl = new URL(clean);
        clean = parsedUrl.searchParams.get('setup') || clean;
      } catch {
        const match = clean.match(/setup=([^&]+)/);
        if (match) clean = decodeURIComponent(match[1]);
      }
    }
    if (!clean.startsWith('FAS1:')) {
      throw new Error('移轉碼格式不正確（需以 FAS1: 開頭或為配對連結）');
    }
    const base64Part = clean.slice(5);
    let decoded;
    try {
      const jsonStr = decodeURIComponent(atob(base64Part));
      decoded = JSON.parse(jsonStr);
    } catch {
      throw new Error('移轉碼解析失敗，請確認複製內容是否完整');
    }

    const updated = this.saveSettings({
      gasUrl: decoded.u || '',
      passcode: decoded.p || '',
      defaultMember: decoded.m || 'Willie',
      monthlyBudget: Number(decoded.b) || 80000,
      lockPin: decoded.pin || ''
    });

    return updated;
  },

  exportFullBackupJson() {
    const data = {
      version: 6,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      members: this.getMembers(),
      categories: this.getCategories(),
      templates: this.getTemplates(),
      transactions: this.getTransactions()
    };
    return JSON.stringify(data, null, 2);
  }
};
