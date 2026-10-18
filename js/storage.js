import {
  DEFAULT_MEMBERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TEMPLATES,
  generateSampleTransactions
} from './defaultData.js';

const STORAGE_KEYS = {
  TRANSACTIONS: 'wc_fas_transactions_v1',
  CATEGORIES: 'wc_fas_categories_v1',
  MEMBERS: 'wc_fas_members_v1',
  TEMPLATES: 'wc_fas_templates_v1',
  SETTINGS: 'wc_fas_settings_v1',
  PENDING_QUEUE: 'wc_fas_pending_queue_v1'
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

  /**
   * 產生跨手機移轉碼 (Migration Code) 與 Magic Link
   * 包含 Google Apps Script 網址、家庭通行碼、預設成員、預算等連線資訊
   */
  generateMigrationCode(targetMember = '') {
    const settings = this.getSettings();
    const payload = {
      v: 1,
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

  /**
   * 解析並套用跨手機移轉碼 (Migration Code)
   */
  applyMigrationCode(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      throw new Error('請輸入有效的換機移轉碼');
    }
    let clean = rawInput.trim();
    // 支援直接貼上完整網址或 FAS1: 開頭的移轉碼
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

  /**
   * 完整匯出 JSON 備份（支援離線換機或手動備份）
   */
  exportFullBackupJson() {
    const data = {
      version: 1,
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
