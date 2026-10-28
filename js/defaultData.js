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
    subcategories: ['日常三餐', '餐廳外食', '生鮮買菜', '咖啡飲料', '甜點零食']
  },
  {
    id: 'cat-home',
    type: 'expense',
    name: '居家生活',
    icon: 'home',
    subcategories: ['房貸/房租', '管理費', '水電瓦斯', '網路電信', '日用雜貨', '家電修繕']
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
    subcategories: ['服飾鞋包', '3C數位', '美妝保養', '居家好物', '禮物採買']
  },
  {
    id: 'cat-entertainment',
    type: 'expense',
    name: '休閒娛樂',
    icon: 'entertainment',
    subcategories: ['國內外旅遊', '影音訂閱', '運動健身', '朋友聚會', '展覽活動']
  },
  {
    id: 'cat-medical',
    type: 'expense',
    name: '醫療保健',
    icon: 'medical',
    subcategories: ['門診掛號', '藥品保健', '牙科檢查', '醫療保險']
  },
  {
    id: 'cat-other-exp',
    type: 'expense',
    name: '進修與其他',
    icon: 'education',
    subcategories: ['書籍課程', '稅金規費', '孝親紅包', '公益捐款', '其他雜支']
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
    subcategory: '房貸/房租',
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
    category: '居家生活',
    subcategory: '網路電信',
    amount: 2200,
    note: '家用光纖與水電帳單',
    isMonthlyFixed: true,
    dayOfMonth: 15
  },
  {
    id: 'tpl-4',
    name: 'Netflix + YouTube 家庭訂閱',
    type: 'expense',
    category: '休閒娛樂',
    subcategory: '影音訂閱',
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
    subcategory: '生鮮買菜',
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
