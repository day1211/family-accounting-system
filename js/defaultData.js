export const DEFAULT_MEMBERS = [
  { id: 'member-willie', name: 'Willie' },
  { id: 'member-christine', name: 'Christine' }
];

export const DEFAULT_CATEGORIES = [
  // 支出分類 (Expense) — 全部採用單色極簡線條圖示
  {
    id: 'cat-food',
    type: 'expense',
    name: '餐飲食品',
    icon: 'utensils',
    subcategories: ['外食', '食物']
  },
  {
    id: 'cat-home',
    type: 'expense',
    name: '居家生活',
    icon: 'home',
    subcategories: ['日常用品', '日常服務', '房貸', '管理費']
  },
  {
    id: 'cat-transport',
    type: 'expense',
    name: '交通出行',
    icon: 'car',
    subcategories: ['加油/充電', '停車過路費', '高鐵/捷運', '計程車/Uber', '保養與保險']
  },
  {
    id: 'cat-shopping',
    type: 'expense',
    name: '購物消費',
    icon: 'shopping',
    subcategories: ['服飾鞋包', '3C數位', '美妝保養', '居家好物', '其他']
  },
  {
    id: 'cat-entertainment',
    type: 'expense',
    name: '休閒娛樂',
    icon: 'entertainment',
    subcategories: ['國內外旅遊', '朋友聚會', '展覽活動']
  },
  {
    id: 'cat-medical',
    type: 'expense',
    name: '醫療保健',
    icon: 'medical',
    subcategories: ['門診掛號', '藥品保健', '健康檢查']
  },
  {
    id: 'cat-other-exp',
    type: 'expense',
    name: '發展進修',
    icon: 'education',
    subcategories: ['課程學習', '運動健身']
  },
  {
    id: 'cat-utilities',
    type: 'expense',
    name: '公用事業',
    icon: 'wrench',
    subcategories: ['水費', '電費', '瓦斯費', '網路', '行動電話', '其他']
  },
  {
    id: 'cat-subscription',
    type: 'expense',
    name: '訂閱服務',
    icon: 'laptop',
    subcategories: ['應用訂閱', '信用卡年費']
  },
  {
    id: 'cat-insurance',
    type: 'expense',
    name: '保險',
    icon: 'landmark',
    subcategories: ['勞健保', '保險']
  },
  {
    id: 'cat-tax',
    type: 'expense',
    name: '萬萬稅',
    icon: 'receipt',
    subcategories: ['所得稅', '罰單']
  },
  {
    id: 'cat-social',
    type: 'expense',
    name: '人際支出',
    icon: 'coffee',
    subcategories: ['人際支出']
  },
  {
    id: 'cat-filial',
    type: 'expense',
    name: '孝親支出',
    icon: 'gift',
    subcategories: ['孝親支出']
  },
  {
    id: 'cat-donation',
    type: 'expense',
    name: '捐獻',
    icon: 'tag',
    subcategories: ['捐獻']
  },
  {
    id: 'cat-parenting',
    type: 'expense',
    name: '育兒',
    icon: 'baby',
    subcategories: [
      '何岱芸學費',
      '滿滿才藝課',
      '其他育兒支出',
      '小荷包才藝課',
      '何岱恩學費'
    ]
  },
  // 收入分類 (Income)
  {
    id: 'cat-salary',
    type: 'income',
    name: '薪資獎金',
    icon: 'wallet',
    subcategories: ['每月本薪', '績效獎金', '年終分紅', '加班津貼']
  },
  {
    id: 'cat-invest',
    type: 'income',
    name: '投資理財',
    icon: 'trending',
    subcategories: ['股票股息', '債券配息', '資本利得', '定存利息']
  },
  {
    id: 'cat-other-inc',
    type: 'income',
    name: '其他收入',
    icon: 'gift',
    subcategories: ['二手拍賣', '退稅/補助', '禮金回饋', '其他收入']
  }
];

export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-1',
    name: '每月房貸扣款',
    type: 'expense',
    category: '居家生活',
    subcategory: '房貸',
    amount: 38000,
    note: '每月固定房貸',
    isMonthlyFixed: true,
    dayOfMonth: 5
  },
  {
    id: 'tpl-2',
    name: '社區管理費',
    type: 'expense',
    category: '居家生活',
    subcategory: '管理費',
    amount: 3500,
    note: '社區物業管理費',
    isMonthlyFixed: true,
    dayOfMonth: 10
  },
  {
    id: 'tpl-3',
    name: '水電瓦斯與光纖網路',
    type: 'expense',
    category: '公用事業',
    subcategory: '網路',
    amount: 2200,
    note: '家用光纖與水電帳單',
    isMonthlyFixed: true,
    dayOfMonth: 15
  },
  {
    id: 'tpl-4',
    name: 'Netflix + YouTube 家庭訂閱',
    type: 'expense',
    category: '訂閱服務',
    subcategory: '應用訂閱',
    amount: 690,
    note: '家庭共享串流平台',
    isMonthlyFixed: true,
    dayOfMonth: 18
  },
  {
    id: 'tpl-5',
    name: '好市多 / 超市生鮮採買',
    type: 'expense',
    category: '餐飲食品',
    subcategory: '食物',
    amount: 2500,
    note: '週末家庭食材採買',
    isMonthlyFixed: false
  },
  {
    id: 'tpl-6',
    name: '汽車加油',
    type: 'expense',
    category: '交通出行',
    subcategory: '加油/充電',
    amount: 1500,
    note: '中油自助加油',
    isMonthlyFixed: false
  }
];

/**
 * 將既有記帳或模板中的舊分類/子分類無痛轉換為新分類結構，不影響既有記帳金額與內容
 */
export function migrateCategoryFields(item) {
  if (!item || typeof item !== 'object') return item;
  let cat = String(item.category || '').trim();
  let sub = String(item.subcategory || '').trim();

  if (cat === '餐飲食品') {
    if (sub === '日常三餐' || sub === '餐廳外食') {
      sub = '外食';
    } else if (sub === '生鮮買菜' || sub === '咖啡飲料' || sub === '甜點零食') {
      sub = '食物';
    }
  } else if (cat === '居家生活') {
    if (sub === '日用雜貨') {
      sub = '日常用品';
    } else if (sub === '家電修繕') {
      sub = '日常服務';
    } else if (sub === '房貸/房租') {
      sub = '房貸';
    } else if (sub === '水電瓦斯') {
      cat = '公用事業';
      sub = '其他';
    } else if (sub === '網路電信') {
      cat = '公用事業';
      sub = '網路';
    }
  } else if (cat === '醫療保健') {
    if (sub === '牙科檢查') {
      sub = '健康檢查';
    } else if (sub === '醫療保險') {
      cat = '保險';
      sub = '保險';
    }
  } else if (cat === '購物消費') {
    if (sub === '禮物採買') {
      sub = '其他';
    }
  } else if (cat === '休閒娛樂') {
    if (sub === '影音訂閱') {
      cat = '訂閱服務';
      sub = '應用訂閱';
    } else if (sub === '運動健身') {
      cat = '發展進修';
      sub = '運動健身';
    }
  } else if (cat === '進修與其他') {
    if (sub === '書籍課程') {
      cat = '發展進修';
      sub = '課程學習';
    } else if (sub === '運動健身') {
      cat = '發展進修';
      sub = '運動健身';
    } else if (sub === '稅金規費') {
      cat = '萬萬稅';
      sub = '所得稅';
    } else if (sub === '孝親紅包') {
      cat = '孝親支出';
      sub = '孝親支出';
    } else if (sub === '公益捐款') {
      cat = '捐獻';
      sub = '捐獻';
    } else {
      cat = '發展進修';
      sub = '課程學習';
    }
  }

  return {
    ...item,
    category: cat,
    subcategory: sub
  };
}

/**
 * 將舊版分類清單升級至 v16 最新分類與子分類結構，同時保留使用者未來自行新增的自訂分類/子分類
 */
export function upgradeCategoriesToV16(savedCats) {
  if (!Array.isArray(savedCats) || savedCats.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }

  // 若清單中仍包含舊版「進修與其他」或缺少新增的「公用事業 / 萬萬稅 / 人際支出」，執行標準升級
  const hasOldName = savedCats.some((c) => c && c.name === '進修與其他');
  const hasNewCats =
    savedCats.some((c) => c && c.name === '公用事業') &&
    savedCats.some((c) => c && c.name === '萬萬稅') &&
    savedCats.some((c) => c && c.name === '人際支出');

  if (hasOldName || !hasNewCats) {
    const defaultIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    const defaultNames = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
    const customUserCats = savedCats.filter(
      (c) =>
        c &&
        c.name !== '進修與其他' &&
        !defaultIds.has(c.id) &&
        !defaultNames.has(c.name)
    );
    return [
      ...JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
      ...customUserCats
    ];
  }

  // 確保「育兒」分類與其 5 個子項目存在，且不影響其他既有的自訂分類
  const parentingDefault = {
    id: 'cat-parenting',
    type: 'expense',
    name: '育兒',
    icon: 'baby',
    subcategories: [
      '何岱芸學費',
      '滿滿才藝課',
      '其他育兒支出',
      '小荷包才藝課',
      '何岱恩學費'
    ]
  };

  const existingParenting = savedCats.find(
    (c) => c && (c.id === 'cat-parenting' || c.name === '育兒')
  );
  if (!existingParenting) {
    const firstIncomeIdx = savedCats.findIndex((c) => c && c.type === 'income');
    const cloned = JSON.parse(JSON.stringify(savedCats));
    if (firstIncomeIdx >= 0) {
      cloned.splice(firstIncomeIdx, 0, parentingDefault);
    } else {
      cloned.push(parentingDefault);
    }
    return cloned;
  } else {
    let changed = false;
    const subs = Array.isArray(existingParenting.subcategories)
      ? [...existingParenting.subcategories]
      : [];
    parentingDefault.subcategories.forEach((s) => {
      if (!subs.includes(s)) {
        subs.push(s);
        changed = true;
      }
    });
    if (existingParenting.icon !== 'baby') {
      existingParenting.icon = 'baby';
      changed = true;
    }
    if (changed) {
      return savedCats.map((c) =>
        c && (c.id === 'cat-parenting' || c.name === '育兒')
          ? { ...c, icon: 'baby', subcategories: subs }
          : c
      );
    }
  }

  return savedCats;
}

export const LEGACY_TEST_TX_IDS = [
  'tx-sample-1',
  'tx-sample-2',
  'tx-sample-3',
  'tx-sample-4',
  'tx-sample-5',
  'tx-sample-6',
  'tx-sample-7',
  'tx-sample-8',
  'tx-sample-9',
  'tx-sample-10',
  'tx-sample-11',
  'tx-sample-12',
  'tx-sample-13',
  'tx-1793017881028',
  'tx-1793017528226',
  'tx-nocors-test'
];

export function generateSampleTransactions() {
  return [];
}

export const CATEGORY_ICON_CHOICES = [
  'utensils',
  'home',
  'car',
  'shopping',
  'entertainment',
  'medical',
  'education',
  'wallet',
  'trending',
  'gift',
  'coffee',
  'baby',
  'plane',
  'dumbbell',
  'laptop',
  'receipt',
  'landmark',
  'wrench',
  'tag'
];
