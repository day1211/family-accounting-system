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

export function generateSampleTransactions() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prevDate = new Date(yyyy, now.getMonth() - 1, 15);
  const prevY = prevDate.getFullYear();
  const prevM = String(prevDate.getMonth() + 1).padStart(2, '0');

  return [
    {
      id: 'tx-1793017881028',
      date: '2026-10-26',
      type: 'expense',
      category: '醫療保健',
      subcategory: '門診掛號',
      amount: 300,
      note: '誠陽',
      createdAt: '2026-10-26T12:31:21.028Z'
    },
    {
      id: 'tx-1793017528226',
      date: '2026-10-26',
      type: 'expense',
      category: '餐飲食品',
      subcategory: '日常三餐',
      amount: 100,
      note: '',
      createdAt: '2026-10-26T12:25:28.226Z'
    },
    {
      id: 'tx-sample-1',
      date: `${yyyy}-${mm}-05`,
      type: 'income',
      category: '薪資獎金',
      subcategory: '每月本薪',
      amount: 177000,
      note: '10月份家庭薪資入帳',
      createdAt: `${yyyy}-${mm}-05T09:00:00Z`
    },
    {
      id: 'tx-sample-3',
      date: `${yyyy}-${mm}-05`,
      type: 'expense',
      category: '居家生活',
      subcategory: '房貸/房租',
      amount: 38000,
      note: '每月固定房貸扣款',
      createdAt: `${yyyy}-${mm}-05T10:15:00Z`
    },
    {
      id: 'tx-sample-4',
      date: `${yyyy}-${mm}-08`,
      type: 'expense',
      category: '餐飲食品',
      subcategory: '生鮮買菜',
      amount: 3420,
      note: 'Costco 好市多牛排、牛奶與水果採買',
      createdAt: `${yyyy}-${mm}-08T15:30:00Z`
    },
    {
      id: 'tx-sample-5',
      date: `${yyyy}-${mm}-10`,
      type: 'expense',
      category: '居家生活',
      subcategory: '管理費',
      amount: 3500,
      note: '10月社區大樓管理費',
      createdAt: `${yyyy}-${mm}-10T11:20:00Z`
    },
    {
      id: 'tx-sample-6',
      date: `${yyyy}-${mm}-12`,
      type: 'expense',
      category: '餐飲食品',
      subcategory: '餐廳外食',
      amount: 2680,
      note: '週末晚餐約會 - 義式餐廳',
      createdAt: `${yyyy}-${mm}-12T20:10:00Z`
    },
    {
      id: 'tx-sample-7',
      date: `${yyyy}-${mm}-14`,
      type: 'expense',
      category: '交通出行',
      subcategory: '加油/充電',
      amount: 1480,
      note: '95無鉛汽油加滿 + Etag儲值',
      createdAt: `${yyyy}-${mm}-14T18:40:00Z`
    },
    {
      id: 'tx-sample-8',
      date: `${yyyy}-${mm}-15`,
      type: 'expense',
      category: '購物消費',
      subcategory: '居家好物',
      amount: 1890,
      note: 'MUJI 無印良品收納盒與寢具',
      createdAt: `${yyyy}-${mm}-15T16:00:00Z`
    },
    {
      id: 'tx-sample-9',
      date: `${yyyy}-${mm}-16`,
      type: 'expense',
      category: '醫療保健',
      subcategory: '藥品保健',
      amount: 1250,
      note: '葉黃素與綜合維他命補充',
      createdAt: `${yyyy}-${mm}-16T13:20:00Z`
    },
    {
      id: 'tx-sample-10',
      date: `${yyyy}-${mm}-17`,
      type: 'expense',
      category: '休閒娛樂',
      subcategory: '影音訂閱',
      amount: 690,
      note: 'Netflix & YouTube Premium 家庭方案',
      createdAt: `${yyyy}-${mm}-17T08:00:00Z`
    },
    {
      id: 'tx-sample-11',
      date: `${yyyy}-${mm}-18`,
      type: 'expense',
      category: '餐飲食品',
      subcategory: '日常三餐',
      amount: 450,
      note: '早午餐與手沖咖啡兩杯',
      createdAt: `${yyyy}-${mm}-18T11:30:00Z`
    },
    {
      id: 'tx-sample-12',
      date: `${prevY}-${prevM}-20`,
      type: 'expense',
      category: '休閒娛樂',
      subcategory: '國內外旅遊',
      amount: 12800,
      note: '宜蘭兩天一夜溫泉住宿與高鐵',
      createdAt: `${prevY}-${prevM}-20T19:00:00Z`
    },
    {
      id: 'tx-sample-13',
      date: `${prevY}-${prevM}-25`,
      type: 'income',
      category: '投資理財',
      subcategory: '股票股息',
      amount: 16500,
      note: '0050 / 美債 ETF 季度配息入帳',
      createdAt: `${prevY}-${prevM}-25T10:00:00Z`
    }
  ];
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
