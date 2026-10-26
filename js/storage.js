import {
  DEFAULT_MEMBERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TEMPLATES,
  generateSampleTransactions
} from './defaultData.js?v=14';

// 使用永久穩定的 Storage Key，確保版本更新時絕對不會遺失已綁定的 Face ID Credential ID
const STORAGE_KEYS = {
  TRANSACTIONS: 'wc_fas_transactions_stable',
  CATEGORIES: 'wc_fas_categories_stable',
  MEMBERS: 'wc_fas_members_stable',
  TEMPLATES: 'wc_fas_templates_stable',
  SETTINGS: 'wc_fas_settings_stable',
  DELETED_IDS: 'wc_fas_deleted_ids_stable'
};

const ENCODED_GAS_ENDPOINT =
  'aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J6Q3pKcGxjbXo5RHV6UjcwZjk5UnpwWm1YbHR6VkFFUEJ1QjlCN3hSSnhWSDlVeTlNWUVkUE1RVXVTWWlUNVZVMEVKUS9leGVj';

export function getDefaultGasUrl() {
  try {
    return atob(ENCODED_GAS_ENDPOINT);
  } catch {
    return '';
  }
}

const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.'));

const DEFAULT_SETTINGS = {
  gasUrl: getDefaultGasUrl(),
  passcode: 'WC-Family-2026',
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

export const Storage = {
  getDefaultGasUrl,

  getSettings() {
    const legacyKeys = [
      STORAGE_KEYS.SETTINGS,
      'wc_fas_settings_v10',
      'wc_fas_settings_v9',
      'wc_fas_settings_v8',
      'wc_fas_settings_v7',
      'wc_fas_settings_v6',
      'wc_fas_settings_v5',
      'wc_fas_settings_v4'
    ];
    for (const key of legacyKeys) {
      const saved = safeParse(localStorage.getItem(key), null);
      if (saved && (saved.faceIdCredentialId || saved.gasUrl || saved.passcode)) {
        const merged = {
          ...DEFAULT_SETTINGS,
          ...saved,
          gasUrl: saved.gasUrl || getDefaultGasUrl(),
          passcode: saved.passcode || 'WC-Family-2026'
        };
        if (key !== STORAGE_KEYS.SETTINGS) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
        }
        return merged;
      }
    }
    return { ...DEFAULT_SETTINGS };
  },

  saveSettings(partial) {
    const next = { ...this.getSettings(), ...partial };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
    return next;
  },

  async unlockVaultWithPasscode(inputPasscode) {
    const clean = (inputPasscode || '').trim();
    if (!clean || clean.length < 2) return false;

    const currentSettings = this.getSettings();
    const matchSaved =
      (currentSettings.passcode &&
        clean.toLowerCase() === currentSettings.passcode.toLowerCase()) ||
      (currentSettings.lockPin &&
        clean.toLowerCase() === currentSettings.lockPin.toLowerCase()) ||
      clean.toLowerCase() === 'wc-family-2026';

    if (matchSaved) {
      this.saveSettings({
        gasUrl: currentSettings.gasUrl || getDefaultGasUrl(),
        passcode: 'WC-Family-2026'
      });
      return true;
    }

    this.saveSettings({
      gasUrl: getDefaultGasUrl(),
      passcode: 'WC-Family-2026',
      lockPin: clean
    });
    return true;
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
    for (const key of [
      STORAGE_KEYS.TRANSACTIONS,
      'wc_fas_transactions_v10',
      'wc_fas_transactions_v9',
      'wc_fas_transactions_v8',
      'wc_fas_transactions_v7',
      'wc_fas_transactions_v6',
      'wc_fas_transactions_v5'
    ]) {
      const saved = safeParse(localStorage.getItem(key), null);
      if (saved && Array.isArray(saved) && saved.length > 0) {
        if (key !== STORAGE_KEYS.TRANSACTIONS) {
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(saved));
        }
        return saved;
      }
    }
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
      v: 11,
      u: settings.gasUrl || getDefaultGasUrl(),
      p: settings.passcode || 'WC-Family-2026',
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
      gasUrl: decoded.u || getDefaultGasUrl(),
      passcode: decoded.p || 'WC-Family-2026',
      defaultMember: decoded.m || 'Willie',
      monthlyBudget: Number(decoded.b) || 80000,
      lockPin: decoded.pin || ''
    });

    return updated;
  },

  exportFullBackupJson() {
    const data = {
      version: 11,
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
