import {
  DEFAULT_MEMBERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TEMPLATES,
  generateSampleTransactions
} from './defaultData.js?v=4';

const STORAGE_KEYS = {
  TRANSACTIONS: 'wc_fas_transactions_v4',
  CATEGORIES: 'wc_fas_categories_v4',
  MEMBERS: 'wc_fas_members_v4',
  TEMPLATES: 'wc_fas_templates_v4',
  SETTINGS: 'wc_fas_settings_v4',
  DELETED_IDS: 'wc_fas_deleted_ids_v4'
};

const DEFAULT_SETTINGS = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzCzJplcmz9DuzR70f99RzpZmXltzVAEPBuB9B7xRJxVH9Uy9MYEdPMQUuSYiT5VU0UJQ/exec',
  passcode: 'WC-Family-2026',
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
    const saved = safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), {});
    return { ...DEFAULT_SETTINGS, ...saved };
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
      v: 4,
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

  generateMigrationUrl(targetMember = '') {
    const code = this.generateMigrationCode(targetMember);
    const url = new URL(window.location.href);
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
      version: 4,
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
