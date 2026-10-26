import {
  DEFAULT_MEMBERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TEMPLATES,
  generateSampleTransactions
} from './defaultData.js';

const STORAGE_KEYS = {
  TRANSACTIONS: 'wc_fas_transactions_v2',
  CATEGORIES: 'wc_fas_categories_v2',
  MEMBERS: 'wc_fas_members_v2',
  TEMPLATES: 'wc_fas_templates_v2',
  SETTINGS: 'wc_fas_settings_v2',
  PENDING_QUEUE: 'wc_fas_pending_queue_v2'
};

const DEFAULT_SETTINGS = {
  gasUrl: '',
  passcode: '',
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
    // 確保移除舊版可能殘留的「共同」
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

  getPendingQueue() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.PENDING_QUEUE), []);
  },

  savePendingQueue(queue) {
    localStorage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify(queue));
  },

  generateMigrationCode(targetMember = '') {
    const settings = this.getSettings();
    const payload = {
      v: 2,
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
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      members: this.getMembers(),
      categories: this.getCategories(),
      templates: this.getTemplates(),
      transactions: this.getTransactions()
    };
    return JSON.stringify(data, null, 2);
  },

  importFullBackupJson(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      throw new Error('備份檔案格式無效');
    }
    if (data.settings) this.saveSettings(data.settings);
    if (Array.isArray(data.members)) this.saveMembers(data.members);
    if (Array.isArray(data.categories)) this.saveCategories(data.categories);
    if (Array.isArray(data.templates)) this.saveTemplates(data.templates);
    if (Array.isArray(data.transactions)) this.saveTransactions(data.transactions);
    return true;
  }
};
