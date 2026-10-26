import {
  DEFAULT_MEMBERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TEMPLATES,
  generateSampleTransactions
} from './defaultData.js?v=5';

const STORAGE_KEYS = {
  TRANSACTIONS: 'wc_fas_transactions_v5',
  CATEGORIES: 'wc_fas_categories_v5',
  MEMBERS: 'wc_fas_members_v5',
  TEMPLATES: 'wc_fas_templates_v5',
  SETTINGS: 'wc_fas_settings_v5',
  DELETED_IDS: 'wc_fas_deleted_ids_v5'
};

// 資安設計：公開程式碼絕不暴露私密金鑰；僅在本機開發環境 (localhost) 提供預設開發連線輔助
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
  isDemoData: true
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
  getSettings() {
    // 遷移舊版設定（若使用者已在 v4 儲存過連線設定則自動保留）
    const savedV5 = safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), null);
    if (savedV5) {
      return { ...DEFAULT_SETTINGS, ...savedV5 };
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
    if (!saved || !Array.isArray(saved)) {
      const sample = generateSampleTransactions();
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(sample));
      return sample;
    }
    return saved;
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
      v: 5,
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
      version: 5,
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
