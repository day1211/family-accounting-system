import { CATEGORY_ICON_CHOICES, CATEGORY_COLOR_CHOICES } from './defaultData.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { Api } from './api.js';

const State = {
  activeTab: 'dashboard',
  currentYearMonth: getTodayYearMonth(),
  expandedCategory: null,
  txForm: {
    id: '',
    type: 'expense',
    category: '餐飲食品',
    subcategory: '日常三餐',
    member: 'Willie',
    amount: '',
    date: getTodayDateStr(),
    note: ''
  },
  catForm: {
    icon: '🍽️',
    color: '#4F46E5'
  }
};

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayYearMonth() {
  return getTodayDateStr().slice(0, 7);
}

function formatCurrency(num) {
  const n = Math.round(Number(num) || 0);
  return '$' + n.toLocaleString('en-US');
}

function showToast(msg, duration = 3200) {
  const banner = document.getElementById('toast-banner');
  const text = document.getElementById('toast-banner-text');
  if (!banner || !text) return;
  text.textContent = msg;
  banner.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, duration);
}

/**
 * 檢查網址是否帶有跨手機換機 / 家人配對參數 (?setup=FAS1:...)
 */
async function checkUrlMigrationOnBoot() {
  const params = new URLSearchParams(window.location.search);
  const setupCode = params.get('setup');
  if (!setupCode) return;

  try {
    const updated = Storage.applyMigrationCode(setupCode);
    // 清除網址列上的敏感憑證參數
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    showToast(`🎉 已成功匯入 ${updated.defaultMember} 的家庭帳本連線設定！正在同步雲端...`, 4500);
    if (Api.isConfigured()) {
      await triggerCloudSync(true);
    }
  } catch (err) {
    showToast(`⚠️ 配對連結解析失敗：${err.message}`, 4000);
  }
}

/**
 * 初始化 Face ID 鎖定檢查
 */
async function initFaceIdGuard() {
  const lockScreen = document.getElementById('lock-screen');
  if (Auth.isSessionUnlocked()) {
    lockScreen.classList.add('hidden');
    lockScreen.classList.remove('flex');
    return;
  }

  lockScreen.classList.remove('hidden');
  lockScreen.classList.add('flex');

  // 自動嘗試喚起一次 Face ID
  setTimeout(() => {
    handleFaceIdUnlock();
  }, 250);
}

async function handleFaceIdUnlock() {
  const errEl = document.getElementById('lock-error-msg');
  errEl.textContent = '正在喚起 Face ID 驗證...';
  try {
    const ok = await Auth.verifyFaceId();
    if (ok) {
      errEl.textContent = '';
      document.getElementById('lock-screen').classList.add('hidden');
      document.getElementById('lock-screen').classList.remove('flex');
      showToast('🔓 Face ID 解鎖成功');
    }
  } catch (err) {
    errEl.textContent = 'Face ID 未完成驗證，可再次點擊圖示或使用下方家庭通行碼解鎖';
  }
}

/**
 * 切換底部分頁
 */
function switchTab(tabName) {
  State.activeTab = tabName;
  const views = ['dashboard', 'search', 'manage', 'settings'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      el.classList.toggle('hidden', v !== tabName);
    }
  });

  document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
    const isCurrent = btn.getAttribute('data-tab') === tabName;
    btn.classList.toggle('text-indigo-600', isCurrent);
    btn.classList.toggle('font-bold', isCurrent);
    btn.classList.toggle('text-slate-400', !isCurrent);
    btn.classList.toggle('font-medium', !isCurrent);
  });

  renderAll();
}

/**
 * 月份切換
 */
function shiftYearMonth(delta) {
  const [y, m] = State.currentYearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  State.currentYearMonth = `${ny}-${nm}`;
  renderAll();
}

function formatYearMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}年 ${Number(m)}月`;
}

/**
 * 渲染頂部狀態與所有畫面
 */
function renderAll() {
  renderHeaderAndSyncBadge();
  renderDashboard();
  renderSearchView();
  renderManageView();
  renderSettingsView();
}

function renderHeaderAndSyncBadge() {
  const settings = Storage.getSettings();
  const members = Storage.getMembers();
  document.getElementById('current-month-label').textContent = formatYearMonthLabel(State.currentYearMonth);

  const memberNames = members.map((m) => m.name).join(' · ');
  document.getElementById('header-subtitle').textContent = `${memberNames} 共用雲端帳本`;

  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  const queue = Storage.getPendingQueue();

  if (Api.isConfigured()) {
    if (queue.length > 0) {
      badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 cursor-pointer';
      text.textContent = `待同步 (${queue.length})`;
    } else {
      badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 cursor-pointer';
      text.textContent = 'Google Sheet 已連線';
    }
  } else {
    badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 cursor-pointer';
    text.textContent = settings.isDemoData ? '範例展示模式' : '本機儲存模式';
  }
}

/**
 * 渲染 Tab 1: Percento 風格總覽 Dashboard
 */
function renderDashboard() {
  const allTx = Storage.getTransactions();
  const categories = Storage.getCategories();
  const members = Storage.getMembers();
  const settings = Storage.getSettings();
  const ym = State.currentYearMonth;

  const monthTx = allTx
    .filter((t) => String(t.date || '').startsWith(ym))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  let totalExpense = 0;
  let totalIncome = 0;
  const memberExpenseMap = {};
  members.forEach((m) => {
    memberExpenseMap[m.name] = 0;
  });

  const catExpenseMap = {};
  const subcatExpenseMap = {};

  monthTx.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      memberExpenseMap[t.member] = (memberExpenseMap[t.member] || 0) + amt;

      if (!catExpenseMap[t.category]) {
        catExpenseMap[t.category] = { amount: 0, count: 0 };
      }
      catExpenseMap[t.category].amount += amt;
      catExpenseMap[t.category].count += 1;

      const subKey = `${t.category}__${t.subcategory || '未分類'}`;
      subcatExpenseMap[subKey] = (subcatExpenseMap[subKey] || 0) + amt;
    }
  });

  const netBalance = totalIncome - totalExpense;
  document.getElementById('hero-month-title').textContent = `${formatYearMonthLabel(ym)} 家庭總支出`;
  document.getElementById('hero-total-expense').textContent = formatCurrency(totalExpense);
  document.getElementById('hero-total-income').textContent = formatCurrency(totalIncome);

  const netEl = document.getElementById('hero-net-balance');
  netEl.textContent = (netBalance >= 0 ? '+' : '-') + formatCurrency(Math.abs(netBalance));
  netEl.className = `text-sm font-bold tabular-nums ${netBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`;

  const budget = Number(settings.monthlyBudget) || 80000;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((totalExpense / budget) * 100)) : 0;
  document.getElementById('hero-budget-percent').textContent = `${budgetPct}% (${formatCurrency(budget)})`;
  document.getElementById('hero-budget-bar').style.width = `${budgetPct}%`;

  // 渲染成員分攤比例 (Willie / Christine / 共同)
  const memberBreakdownEl = document.getElementById('hero-member-breakdown');
  memberBreakdownEl.innerHTML = members
    .map((m) => {
      const mAmt = memberExpenseMap[m.name] || 0;
      const pct = totalExpense > 0 ? Math.round((mAmt / totalExpense) * 100) : 0;
      return `
        <button type="button" data-jump-member="${m.name}" class="flex-1 rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-left transition">
          <div class="flex items-center justify-between text-[11px] text-indigo-100">
            <span class="font-bold truncate">${m.icon || '👤'} ${m.name}</span>
            <span class="opacity-80 tabular-nums">${pct}%</span>
          </div>
          <div class="text-xs font-extrabold text-white tabular-nums mt-0.5">${formatCurrency(mAmt)}</div>
        </button>
      `;
    })
    .join('');

  memberBreakdownEl.querySelectorAll('[data-jump-member]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mName = btn.getAttribute('data-jump-member');
      document.getElementById('filter-scope').value = 'current';
      document.getElementById('filter-member').value = mName;
      document.getElementById('filter-type').value = 'expense';
      switchTab('search');
    });
  });

  // 渲染 Percento 招牌分類佔比條與列表
  const breakdownItems = Object.keys(catExpenseMap)
    .map((catName) => {
      const found = categories.find((c) => c.name === catName) || {
        name: catName,
        icon: '🏷️',
        color: '#6366F1'
      };
      const amount = catExpenseMap[catName].amount;
      const count = catExpenseMap[catName].count;
      const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
      return {
        name: catName,
        icon: found.icon,
        color: found.color,
        amount,
        count,
        pct
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const allocBar = document.getElementById('allocation-bar');
  const catList = document.getElementById('category-breakdown-list');

  if (breakdownItems.length === 0) {
    allocBar.innerHTML = `<div class="w-full h-full bg-slate-200 rounded-full"></div>`;
    catList.innerHTML = `
      <div class="py-6 text-center text-xs text-slate-400">
        本月尚無支出紀錄，點擊下方「＋」開始記第一筆帳吧！
      </div>
    `;
  } else {
    allocBar.innerHTML = breakdownItems
      .map(
        (item) =>
          `<div class="allocation-bar-segment" style="width: ${Math.max(item.pct, 3)}%; background-color: ${item.color};" title="${item.name}: ${item.pct.toFixed(1)}%"></div>`
      )
      .join('');

    catList.innerHTML = breakdownItems
      .map((item) => {
        const isExpanded = State.expandedCategory === item.name;
        // 整理該主分類下的子分類佔比
        const subItems = Object.keys(subcatExpenseMap)
          .filter((k) => k.startsWith(`${item.name}__`))
          .map((k) => {
            const subName = k.split('__')[1];
            const sAmt = subcatExpenseMap[k];
            const sPct = item.amount > 0 ? Math.round((sAmt / item.amount) * 100) : 0;
            return { subName, sAmt, sPct };
          })
          .sort((a, b) => b.sAmt - a.sAmt);

        return `
          <div class="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition">
            <div class="flex items-center justify-between cursor-pointer" data-toggle-cat="${item.name}">
              <div class="flex items-center gap-2.5">
                <span class="flex h-9 w-9 items-center justify-center rounded-xl text-base shadow-sm" style="background-color: ${item.color}18; color: ${item.color}">
                  ${item.icon}
                </span>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-extrabold text-slate-800">${item.name}</span>
                    <span class="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200/60 tabular-nums">${item.pct.toFixed(1)}%</span>
                  </div>
                  <span class="text-[11px] text-slate-400">${item.count} 筆紀錄 · 點擊展開子分類</span>
                </div>
              </div>
              <div class="text-right">
                <div class="text-sm font-extrabold text-slate-900 tabular-nums">${formatCurrency(item.amount)}</div>
              </div>
            </div>

            ${
              isExpanded
                ? `
              <div class="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1.5">
                ${subItems
                  .map(
                    (s) => `
                  <div class="flex items-center justify-between text-xs px-1">
                    <span class="text-slate-600 font-medium">↳ ${s.subName}</span>
                    <div class="flex items-center gap-2 tabular-nums">
                      <span class="text-[11px] text-slate-400">${s.sPct}%</span>
                      <span class="font-bold text-slate-800">${formatCurrency(s.sAmt)}</span>
                    </div>
                  </div>
                `
                  )
                  .join('')}
                <div class="pt-1 text-right">
                  <button type="button" data-filter-cat="${item.name}" class="text-[11px] font-bold text-indigo-600 hover:underline">
                    查看「${item.name}」所有明細 →
                  </button>
                </div>
              </div>
            `
                : ''
            }
          </div>
        `;
      })
      .join('');

    catList.querySelectorAll('[data-toggle-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        const cName = el.getAttribute('data-toggle-cat');
        State.expandedCategory = State.expandedCategory === cName ? null : cName;
        renderDashboard();
      });
    });

    catList.querySelectorAll('[data-filter-cat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cName = btn.getAttribute('data-filter-cat');
        document.getElementById('filter-scope').value = 'current';
        document.getElementById('filter-category').value = cName;
        switchTab('search');
      });
    });
  }

  // 渲染近期 6 筆收支明細
  const recentEl = document.getElementById('recent-transactions-list');
  const recentSlice = monthTx.slice(0, 6);
  if (recentSlice.length === 0) {
    recentEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">本月尚無帳目紀錄</div>`;
  } else {
    recentEl.innerHTML = recentSlice.map((tx) => renderTransactionRowHtml(tx, categories, members)).join('');
    bindTransactionRowClicks(recentEl);
  }
}

function renderTransactionRowHtml(tx, categories, members) {
  const catObj = categories.find((c) => c.name === tx.category) || {
    icon: tx.type === 'income' ? '💰' : '🏷️',
    color: '#6366F1'
  };
  const memObj = members.find((m) => m.name === tx.member) || {
    name: tx.member || 'Willie',
    color: '#4F46E5',
    bg: '#EEF2FF'
  };
  const isIncome = tx.type === 'income';

  return `
    <div data-tx-id="${tx.id}" class="py-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50/80 rounded-xl px-1 transition">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg" style="background-color: ${catObj.color}18">
          ${catObj.icon}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-extrabold text-slate-900 truncate">${tx.category}${tx.subcategory ? ` · ${tx.subcategory}` : ''}</span>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style="background-color: ${memObj.bg || '#EEF2FF'}; color: ${memObj.color || '#4F46E5'}">
              ${tx.member}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 truncate mt-0.5">
            ${tx.note ? tx.note : '無備註'} <span class="text-slate-300">·</span> ${tx.date}
          </p>
        </div>
      </div>
      <div class="text-right shrink-0">
        <span class="text-sm font-extrabold tabular-nums ${isIncome ? 'text-emerald-600' : 'text-slate-900'}">
          ${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}
        </span>
      </div>
    </div>
  `;
}

function bindTransactionRowClicks(container) {
  container.querySelectorAll('[data-tx-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-tx-id');
      openTransactionModal(id);
    });
  });
}

/**
 * 渲染 Tab 2: 秒速歷史搜尋與篩選
 */
function populateSearchFilterDropdowns() {
  const members = Storage.getMembers();
  const categories = Storage.getCategories();

  const memSelect = document.getElementById('filter-member');
  const currentMem = memSelect.value || 'all';
  memSelect.innerHTML =
    `<option value="all">👥 全部家庭成員</option>` +
    members.map((m) => `<option value="${m.name}">${m.icon || '👤'} ${m.name}</option>`).join('');
  if ([...memSelect.options].some((o) => o.value === currentMem)) {
    memSelect.value = currentMem;
  }

  const catSelect = document.getElementById('filter-category');
  const currentCat = catSelect.value || 'all';
  catSelect.innerHTML =
    `<option value="all">🏷️ 全部主分類</option>` +
    categories.map((c) => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  if ([...catSelect.options].some((o) => o.value === currentCat)) {
    catSelect.value = currentCat;
  }
}

function renderSearchView() {
  populateSearchFilterDropdowns();
  const allTx = Storage.getTransactions();
  const categories = Storage.getCategories();
  const members = Storage.getMembers();

  const keyword = (document.getElementById('search-keyword').value || '').trim().toLowerCase();
  const scope = document.getElementById('filter-scope').value;
  const typeFilter = document.getElementById('filter-type').value;
  const memberFilter = document.getElementById('filter-member').value;
  const catFilter = document.getElementById('filter-category').value;

  const filtered = allTx
    .filter((tx) => {
      if (scope === 'current' && !String(tx.date || '').startsWith(State.currentYearMonth)) {
        return false;
      }
      if (typeFilter !== 'all' && tx.type !== typeFilter) {
        return false;
      }
      if (memberFilter !== 'all' && tx.member !== memberFilter) {
        return false;
      }
      if (catFilter !== 'all' && tx.category !== catFilter) {
        return false;
      }
      if (keyword) {
        const hay = `${tx.category} ${tx.subcategory} ${tx.note} ${tx.member} ${tx.date} ${tx.amount}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  let sumExp = 0;
  let sumInc = 0;
  filtered.forEach((t) => {
    if (t.type === 'income') sumInc += Number(t.amount) || 0;
    else sumExp += Number(t.amount) || 0;
  });

  document.getElementById('search-result-count').textContent = `${filtered.length} 筆`;
  document.getElementById('search-sum-expense').textContent = formatCurrency(sumExp);
  document.getElementById('search-sum-income').textContent = formatCurrency(sumInc);

  const listEl = document.getElementById('search-results-list');
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="py-10 text-center text-xs text-slate-400">
        找不到符合條件的收支紀錄，試試調整搜尋關鍵字或切換為「全部歷史月份」
      </div>
    `;
  } else {
    listEl.innerHTML = filtered.map((tx) => renderTransactionRowHtml(tx, categories, members)).join('');
    bindTransactionRowClicks(listEl);
  }
}

/**
 * 渲染 Tab 3: 自訂分類、子分類、成員與固定收支模板管理
 */
function renderManageView() {
  const templates = Storage.getTemplates();
  const categories = Storage.getCategories();
  const members = Storage.getMembers();

  // 1. 常用模板列表
  const tplListEl = document.getElementById('templates-list');
  if (templates.length === 0) {
    tplListEl.innerHTML = `<div class="text-xs text-slate-400 py-3 text-center">尚無常用模板</div>`;
  } else {
    tplListEl.innerHTML = templates
      .map(
        (tpl) => `
      <div class="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-extrabold text-slate-900">${tpl.name}</span>
            ${
              tpl.isMonthlyFixed
                ? `<span class="rounded-md bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[10px] font-bold">每月固定</span>`
                : ''
            }
            <span class="rounded-md bg-slate-200/80 text-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">${tpl.member}</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">${tpl.category} · ${tpl.subcategory || ''} · ${formatCurrency(tpl.amount)}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" data-use-tpl="${tpl.id}" class="rounded-xl bg-indigo-600 text-white px-2.5 py-1.5 text-[11px] font-bold">
            記一筆
          </button>
          <button type="button" data-del-tpl="${tpl.id}" class="rounded-xl bg-rose-50 text-rose-600 px-2 py-1.5 text-[11px] font-bold">
            ✕
          </button>
        </div>
      </div>
    `
      )
      .join('');

    tplListEl.querySelectorAll('[data-use-tpl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-use-tpl');
        openTransactionModal('', id);
      });
    });

    tplListEl.querySelectorAll('[data-del-tpl]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-tpl');
        const next = Storage.getTemplates().filter((t) => t.id !== id);
        Storage.saveTemplates(next);
        renderManageView();
        await Api.syncSettingsToCloud();
        showToast('已刪除模板');
      });
    });
  }

  // 2. 自訂收支分類與子分類管理
  const catListEl = document.getElementById('manage-categories-list');
  catListEl.innerHTML = categories
    .map(
      (cat) => `
    <div class="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl text-base" style="background-color: ${cat.color}20">
            ${cat.icon}
          </span>
          <div>
            <span class="text-xs font-extrabold text-slate-900">${cat.name}</span>
            <span class="ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              cat.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
            }">
              ${cat.type === 'income' ? '收入' : '支出'}
            </span>
          </div>
        </div>
        <button type="button" data-del-cat="${cat.id}" class="text-[11px] font-semibold text-rose-500 hover:text-rose-700">
          刪除分類
        </button>
      </div>

      <!-- 子分類膠囊與新增子分類 -->
      <div class="flex flex-wrap items-center gap-1.5 pt-1">
        ${(cat.subcategories || [])
          .map(
            (sub) => `
          <span class="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            ${sub}
            <button type="button" data-del-sub="${cat.id}__${sub}" class="text-slate-400 hover:text-rose-500 ml-0.5">×</button>
          </span>
        `
          )
          .join('')}
        <button type="button" data-add-sub="${cat.id}" class="rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 px-2.5 py-1 text-[11px] font-bold hover:bg-indigo-100">
          ＋ 子分類
        </button>
      </div>
    </div>
  `
    )
    .join('');

  catListEl.querySelectorAll('[data-add-sub]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catId = btn.getAttribute('data-add-sub');
      const subName = window.prompt('請輸入要新增的子分類名稱：');
      if (!subName || !subName.trim()) return;
      const cats = Storage.getCategories();
      const target = cats.find((c) => c.id === catId);
      if (target) {
        if (!target.subcategories.includes(subName.trim())) {
          target.subcategories.push(subName.trim());
          Storage.saveCategories(cats);
          renderAll();
          await Api.syncSettingsToCloud();
          showToast(`已新增子分類「${subName.trim()}」`);
        }
      }
    });
  });

  catListEl.querySelectorAll('[data-del-sub]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [catId, subName] = btn.getAttribute('data-del-sub').split('__');
      const cats = Storage.getCategories();
      const target = cats.find((c) => c.id === catId);
      if (target) {
        target.subcategories = target.subcategories.filter((s) => s !== subName);
        Storage.saveCategories(cats);
        renderAll();
        await Api.syncSettingsToCloud();
      }
    });
  });

  catListEl.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catId = btn.getAttribute('data-del-cat');
      const cats = Storage.getCategories();
      if (cats.length <= 2) {
        showToast('請至少保留兩個基本分類');
        return;
      }
      const target = cats.find((c) => c.id === catId);
      if (!window.confirm(`確定要刪除「${target ? target.name : ''}」主分類嗎？`)) return;
      Storage.saveCategories(cats.filter((c) => c.id !== catId));
      renderAll();
      await Api.syncSettingsToCloud();
      showToast('已刪除主分類');
    });
  });

  // 3. 家庭成員管理 (Willie, Christine, 共同，支援改名與新增)
  const memListEl = document.getElementById('manage-members-list');
  memListEl.innerHTML = members
    .map(
      (m) => `
    <div class="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200/70 px-3 py-2">
      <div class="flex items-center gap-2">
        <span class="text-base">${m.icon || '👤'}</span>
        <span class="text-xs font-extrabold text-slate-800">${m.name}</span>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" data-rename-mem="${m.id}" class="text-[11px] font-semibold text-indigo-600">改名</button>
        ${
          members.length > 1
            ? `<button type="button" data-del-mem="${m.id}" class="text-[11px] font-semibold text-rose-500">刪除</button>`
            : ''
        }
      </div>
    </div>
  `
    )
    .join('');

  memListEl.querySelectorAll('[data-rename-mem]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-rename-mem');
      const list = Storage.getMembers();
      const target = list.find((m) => m.id === id);
      if (!target) return;
      const newName = window.prompt('請輸入新的成員稱呼：', target.name);
      if (!newName || !newName.trim()) return;
      const oldName = target.name;
      target.name = newName.trim();
      Storage.saveMembers(list);

      // 同步更新歷史交易中的成員名稱
      const txs = Storage.getTransactions().map((t) =>
        t.member === oldName ? { ...t, member: target.name } : t
      );
      Storage.saveTransactions(txs);
      renderAll();
      await Api.syncSettingsToCloud();
      showToast(`成員名稱已更新為「${target.name}」`);
    });
  });

  memListEl.querySelectorAll('[data-del-mem]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-mem');
      const list = Storage.getMembers();
      if (list.length <= 1) return;
      Storage.saveMembers(list.filter((m) => m.id !== id));
      renderAll();
      await Api.syncSettingsToCloud();
    });
  });
}

/**
 * 渲染 Tab 4: 設定、Face ID 與跨手機無痛移轉
 */
function renderSettingsView() {
  const settings = Storage.getSettings();
  const members = Storage.getMembers();

  // Face ID 狀態
  const badge = document.getElementById('faceid-badge');
  const btnDisable = document.getElementById('btn-disable-faceid');
  const btnSetup = document.getElementById('btn-setup-faceid');

  if (settings.faceIdEnabled) {
    badge.textContent = '已啟用 Face ID 保護';
    badge.className = 'rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-700';
    btnDisable.classList.remove('hidden');
    btnSetup.textContent = '重新綁定本機 Face ID';
  } else {
    badge.textContent = '未啟用';
    badge.className = 'rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600';
    btnDisable.classList.add('hidden');
    btnSetup.textContent = '啟用 / 綁定本機 Face ID';
  }

  // 成員選單
  const defMemSelect = document.getElementById('setting-default-member');
  const migMemSelect = document.getElementById('migration-target-member');

  defMemSelect.innerHTML = members
    .map((m) => `<option value="${m.name}">${m.icon || '👤'} ${m.name}</option>`)
    .join('');
  defMemSelect.value = settings.defaultMember || 'Willie';

  migMemSelect.innerHTML = members
    .map((m) => `<option value="${m.name}">${m.name}（設定為新手機預設記帳人）</option>`)
    .join('');

  document.getElementById('setting-gas-url').value = settings.gasUrl || '';
  document.getElementById('setting-passcode').value = settings.passcode || '';
  document.getElementById('setting-monthly-budget').value = settings.monthlyBudget || 80000;
}

/**
 * 開啟「新增 / 編輯收支」Bottom Sheet Modal
 */
function openTransactionModal(editTxId = '', templateId = '') {
  const categories = Storage.getCategories();
  const members = Storage.getMembers();
  const templates = Storage.getTemplates();
  const settings = Storage.getSettings();

  const modal = document.getElementById('modal-transaction');
  const btnDelete = document.getElementById('btn-delete-tx');
  const titleEl = document.getElementById('modal-tx-title');

  if (editTxId) {
    const found = Storage.getTransactions().find((t) => t.id === editTxId);
    if (found) {
      State.txForm = {
        id: found.id,
        type: found.type || 'expense',
        category: found.category,
        subcategory: found.subcategory || '',
        member: found.member || settings.defaultMember || 'Willie',
        amount: found.amount,
        date: found.date,
        note: found.note || ''
      };
      titleEl.textContent = '編輯收支紀錄';
      btnDelete.classList.remove('hidden');
    }
  } else if (templateId) {
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      State.txForm = {
        id: '',
        type: tpl.type || 'expense',
        category: tpl.category,
        subcategory: tpl.subcategory || '',
        member: tpl.member || settings.defaultMember || 'Willie',
        amount: tpl.amount,
        date: getTodayDateStr(),
        note: tpl.note || tpl.name
      };
      titleEl.textContent = `套用模板：${tpl.name}`;
      btnDelete.classList.add('hidden');
    }
  } else {
    const firstExpCat = categories.find((c) => c.type === 'expense') || categories[0];
    State.txForm = {
      id: '',
      type: 'expense',
      category: firstExpCat ? firstExpCat.name : '餐飲食品',
      subcategory: firstExpCat && firstExpCat.subcategories[0] ? firstExpCat.subcategories[0] : '',
      member: settings.defaultMember || 'Willie',
      amount: '',
      date: getTodayDateStr(),
      note: ''
    };
    titleEl.textContent = '新增收支紀錄';
    btnDelete.classList.add('hidden');
  }

  renderTxModalFields();
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  setTimeout(() => {
    document.getElementById('tx-amount').focus();
  }, 150);
}

function renderTxModalFields() {
  const categories = Storage.getCategories();
  const members = Storage.getMembers();
  const templates = Storage.getTemplates();

  // 1. 常用模板橫向按鈕
  const quickTplEl = document.getElementById('modal-quick-templates');
  quickTplEl.innerHTML = templates
    .map(
      (t) => `
    <button type="button" data-quick-tpl="${t.id}" class="shrink-0 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 px-3 py-1 text-[11px] font-bold transition">
      ${t.name} (${formatCurrency(t.amount)})
    </button>
  `
    )
    .join('');

  quickTplEl.querySelectorAll('[data-quick-tpl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tplId = btn.getAttribute('data-quick-tpl');
      const tpl = templates.find((x) => x.id === tplId);
      if (!tpl) return;
      State.txForm.type = tpl.type || 'expense';
      State.txForm.category = tpl.category;
      State.txForm.subcategory = tpl.subcategory || '';
      State.txForm.member = tpl.member || State.txForm.member;
      State.txForm.amount = tpl.amount;
      State.txForm.note = tpl.note || tpl.name;
      renderTxModalFields();
    });
  });

  // 2. 類型切換按鈕
  document.querySelectorAll('.tx-type-btn').forEach((btn) => {
    const isSelected = btn.getAttribute('data-tx-type') === State.txForm.type;
    btn.className = isSelected
      ? 'tx-type-btn rounded-xl py-2 text-xs font-extrabold bg-white text-slate-900 shadow-sm transition'
      : 'tx-type-btn rounded-xl py-2 text-xs font-extrabold text-slate-500 transition';
  });

  // 3. 金額、日期、備註
  document.getElementById('tx-id').value = State.txForm.id;
  document.getElementById('tx-amount').value = State.txForm.amount;
  document.getElementById('tx-date').value = State.txForm.date;
  document.getElementById('tx-note').value = State.txForm.note;

  // 4. 成員選擇膠囊 (Willie / Christine / 共同)
  const memPills = document.getElementById('tx-member-pills');
  memPills.innerHTML = members
    .map((m) => {
      const active = State.txForm.member === m.name;
      return `
      <button type="button" data-pick-member="${m.name}" class="flex-1 rounded-xl py-2 px-3 text-xs font-extrabold border transition ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70'
      }">
        ${m.icon || '👤'} ${m.name}
      </button>
    `;
    })
    .join('');

  memPills.querySelectorAll('[data-pick-member]').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.txForm.amount = document.getElementById('tx-amount').value;
      State.txForm.date = document.getElementById('tx-date').value;
      State.txForm.note = document.getElementById('tx-note').value;
      State.txForm.member = btn.getAttribute('data-pick-member');
      renderTxModalFields();
    });
  });

  // 5. 主分類網格
  const filteredCats = categories.filter((c) => c.type === State.txForm.type);
  if (!filteredCats.some((c) => c.name === State.txForm.category) && filteredCats.length > 0) {
    State.txForm.category = filteredCats[0].name;
    State.txForm.subcategory = filteredCats[0].subcategories[0] || '';
  }

  const catGrid = document.getElementById('tx-category-grid');
  catGrid.innerHTML = filteredCats
    .map((c) => {
      const active = State.txForm.category === c.name;
      return `
      <button type="button" data-pick-cat="${c.name}" class="flex flex-col items-center justify-center rounded-2xl p-2 border text-center transition ${
        active
          ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-600/20'
          : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
      }">
        <span class="text-xl">${c.icon}</span>
        <span class="text-[11px] font-bold mt-1 truncate w-full ${active ? 'text-indigo-700' : 'text-slate-700'}">${c.name}</span>
      </button>
    `;
    })
    .join('');

  catGrid.querySelectorAll('[data-pick-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.txForm.amount = document.getElementById('tx-amount').value;
      State.txForm.date = document.getElementById('tx-date').value;
      State.txForm.note = document.getElementById('tx-note').value;
      const pickedName = btn.getAttribute('data-pick-cat');
      State.txForm.category = pickedName;
      const catObj = filteredCats.find((c) => c.name === pickedName);
      State.txForm.subcategory = catObj && catObj.subcategories[0] ? catObj.subcategories[0] : '';
      renderTxModalFields();
    });
  });

  // 6. 子分類膠囊
  const currentCatObj = filteredCats.find((c) => c.name === State.txForm.category);
  const subList = currentCatObj ? currentCatObj.subcategories || [] : [];
  const subPills = document.getElementById('tx-subcategory-pills');

  subPills.innerHTML =
    subList
      .map((sub) => {
        const active = State.txForm.subcategory === sub;
        return `
        <button type="button" data-pick-sub="${sub}" class="rounded-full px-3 py-1 text-xs font-bold border transition ${
          active
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
        }">
          ${sub}
        </button>
      `;
      })
      .join('') +
    `
    <button type="button" id="btn-inline-add-sub" class="rounded-full px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-200">
      ＋ 新增子分類
    </button>
  `;

  subPills.querySelectorAll('[data-pick-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.txForm.amount = document.getElementById('tx-amount').value;
      State.txForm.date = document.getElementById('tx-date').value;
      State.txForm.note = document.getElementById('tx-note').value;
      State.txForm.subcategory = btn.getAttribute('data-pick-sub');
      renderTxModalFields();
    });
  });

  const btnInlineAddSub = document.getElementById('btn-inline-add-sub');
  if (btnInlineAddSub && currentCatObj) {
    btnInlineAddSub.addEventListener('click', async () => {
      const newSub = window.prompt(`為「${currentCatObj.name}」新增子分類：`);
      if (!newSub || !newSub.trim()) return;
      const allCats = Storage.getCategories();
      const target = allCats.find((c) => c.id === currentCatObj.id);
      if (target) {
        target.subcategories.push(newSub.trim());
        Storage.saveCategories(allCats);
        State.txForm.subcategory = newSub.trim();
        renderTxModalFields();
        await Api.syncSettingsToCloud();
      }
    });
  }
}

function closeTransactionModal() {
  const modal = document.getElementById('modal-transaction');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/**
 * 觸發與 Google Sheet 雲端雙向同步
 */
async function triggerCloudSync(silent = false) {
  if (!Api.isConfigured()) {
    if (!silent) {
      showToast('請先在「設定」分頁填入 Google Apps Script 網址與家庭通行碼');
      switchTab('settings');
    }
    return;
  }

  const syncIcon = document.getElementById('sync-icon');
  if (syncIcon) syncIcon.classList.add('animate-spin');

  try {
    await Api.syncWithCloud();
    renderAll();
    if (!silent) {
      showToast('☁️ 已與 Google Sheet 家庭總帳本完成同步！');
    }
  } catch (err) {
    if (!silent) {
      showToast(`⚠️ 同步失敗：${err.message}`);
    }
  } finally {
    if (syncIcon) syncIcon.classList.remove('animate-spin');
  }
}

/**
 * 一鍵批次寫入當月固定收支
 */
async function handleApplyMonthlyFixedTemplates() {
  const templates = Storage.getTemplates().filter((t) => t.isMonthlyFixed);
  if (templates.length === 0) {
    showToast('目前沒有勾選為「每月固定」的模板，可至「分類/模板」設定');
    return;
  }

  const ym = State.currentYearMonth;
  if (!window.confirm(`確定要將 ${templates.length} 筆「每月固定收支」一鍵寫入 ${formatYearMonthLabel(ym)} 帳本嗎？`)) {
    return;
  }

  const allTx = Storage.getTransactions();
  const createdList = templates.map((tpl, idx) => {
    const day = String(tpl.dayOfMonth || 5).padStart(2, '0');
    return {
      id: `tx-${Date.now()}-${idx}`,
      date: `${ym}-${day}`,
      type: tpl.type || 'expense',
      category: tpl.category,
      subcategory: tpl.subcategory || '',
      amount: Number(tpl.amount) || 0,
      member: tpl.member || '共同',
      note: tpl.note || tpl.name,
      createdAt: new Date().toISOString()
    };
  });

  Storage.saveTransactions([...createdList, ...allTx]);
  renderAll();
  await Api.batchInsertTransactions(createdList);
  showToast(`⚡ 已一鍵寫入 ${createdList.length} 筆本月固定收支！`);
}

/**
 * 綁定所有 DOM 事件
 */
function bindEvents() {
  // 頂部 Toast 關閉
  document.getElementById('btn-close-toast').addEventListener('click', () => {
    document.getElementById('toast-banner').classList.add('hidden');
  });

  // Face ID 解鎖畫面事件
  document.getElementById('btn-trigger-faceid').addEventListener('click', () => {
    handleFaceIdUnlock();
  });

  document.getElementById('btn-unlock-passcode').addEventListener('click', () => {
    const val = document.getElementById('input-unlock-passcode').value;
    if (Auth.verifyFallbackPasscode(val)) {
      document.getElementById('lock-screen').classList.add('hidden');
      document.getElementById('lock-screen').classList.remove('flex');
      document.getElementById('input-unlock-passcode').value = '';
      showToast('🔓 通行碼驗證成功');
    } else {
      document.getElementById('lock-error-msg').textContent = '家庭通行碼不正確，請重新輸入';
    }
  });

  // 底部導覽切換
  document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // 月份切換
  document.getElementById('btn-prev-month').addEventListener('click', () => shiftYearMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => shiftYearMonth(1));

  // 同步按鈕
  document.getElementById('btn-sync-now').addEventListener('click', () => triggerCloudSync(false));
  document.getElementById('sync-status-badge').addEventListener('click', () => triggerCloudSync(false));

  // 開啟新增帳目 Modal
  document.getElementById('btn-nav-add').addEventListener('click', () => openTransactionModal());
  document.getElementById('btn-quick-open-add').addEventListener('click', () => openTransactionModal());
  document.getElementById('btn-close-tx-modal').addEventListener('click', closeTransactionModal);

  // 一鍵套用固定收支與快速跳轉
  document.getElementById('btn-apply-monthly-fixed').addEventListener('click', handleApplyMonthlyFixedTemplates);
  document.getElementById('btn-jump-search').addEventListener('click', () => switchTab('search'));
  document.getElementById('btn-view-all-tx').addEventListener('click', () => switchTab('search'));
  document.getElementById('btn-open-cat-manager').addEventListener('click', () => switchTab('manage'));
  document.getElementById('btn-modal-jump-cat').addEventListener('click', () => {
    closeTransactionModal();
    switchTab('manage');
  });

  // 記帳 Modal 內收支類型切換
  document.querySelectorAll('.tx-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.txForm.amount = document.getElementById('tx-amount').value;
      State.txForm.date = document.getElementById('tx-date').value;
      State.txForm.note = document.getElementById('tx-note').value;
      State.txForm.type = btn.getAttribute('data-tx-type');
      renderTxModalFields();
    });
  });

  // 儲存收支表單提交
  document.getElementById('form-transaction').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value || getTodayDateStr();
    const note = document.getElementById('tx-note').value.trim();

    if (!amount || amount <= 0) {
      showToast('請輸入大於 0 的金額');
      return;
    }

    const txObj = {
      id: State.txForm.id || `tx-${Date.now()}`,
      date,
      type: State.txForm.type,
      category: State.txForm.category,
      subcategory: State.txForm.subcategory,
      amount,
      member: State.txForm.member,
      note,
      createdAt: new Date().toISOString()
    };

    const list = Storage.getTransactions();
    const existingIdx = list.findIndex((t) => t.id === txObj.id);
    if (existingIdx >= 0) {
      list[existingIdx] = txObj;
    } else {
      list.unshift(txObj);
    }
    Storage.saveTransactions(list);
    State.currentYearMonth = date.slice(0, 7);

    closeTransactionModal();
    renderAll();

    const syncRes = await Api.upsertTransaction(txObj);
    if (syncRes && syncRes.queued) {
      showToast('已儲存於本機（待網路恢復自動同步至 Google Sheet）');
    } else if (Api.isConfigured()) {
      showToast('✅ 已儲存並同步至 Google Sheet 總帳本！');
    } else {
      showToast('✅ 已儲存收支紀錄！');
    }
  });

  // 刪除單筆收支
  document.getElementById('btn-delete-tx').addEventListener('click', async () => {
    const id = State.txForm.id;
    if (!id) return;
    if (!window.confirm('確定要刪除這筆帳目嗎？')) return;

    const next = Storage.getTransactions().filter((t) => t.id !== id);
    Storage.saveTransactions(next);
    closeTransactionModal();
    renderAll();
    await Api.deleteTransaction(id);
    showToast('🗑️ 已刪除該筆帳目');
  });

  // Tab 2 搜尋與篩選即時監聽
  ['search-keyword', 'filter-scope', 'filter-type', 'filter-member', 'filter-category'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', renderSearchView);
      el.addEventListener('change', renderSearchView);
    }
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('search-keyword').value = '';
    document.getElementById('filter-scope').value = 'all';
    document.getElementById('filter-type').value = 'all';
    document.getElementById('filter-member').value = 'all';
    document.getElementById('filter-category').value = 'all';
    renderSearchView();
  });

  // Tab 3 新增自訂主分類 Modal
  document.getElementById('btn-add-category').addEventListener('click', () => {
    renderCategoryModalPickers();
    const modal = document.getElementById('modal-category');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });

  document.getElementById('btn-close-cat-modal').addEventListener('click', () => {
    const modal = document.getElementById('modal-category');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });

  document.getElementById('form-category').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('cat-type').value;
    const name = document.getElementById('cat-name').value.trim();
    const rawSubs = document.getElementById('cat-subcategories').value;
    if (!name) return;

    const subcategories = rawSubs
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const cats = Storage.getCategories();
    cats.push({
      id: `cat-${Date.now()}`,
      type,
      name,
      icon: State.catForm.icon || '🏷️',
      color: State.catForm.color || '#4F46E5',
      subcategories: subcategories.length > 0 ? subcategories : ['一般']
    });
    Storage.saveCategories(cats);

    document.getElementById('cat-name').value = '';
    document.getElementById('cat-subcategories').value = '';
    document.getElementById('modal-category').classList.add('hidden');
    document.getElementById('modal-category').classList.remove('flex');

    renderAll();
    await Api.syncSettingsToCloud();
    showToast(`🎉 已新增自訂主分類「${name}」`);
  });

  // Tab 3 新增模板 Modal
  document.getElementById('btn-add-template').addEventListener('click', () => {
    const cats = Storage.getCategories();
    const mems = Storage.getMembers();
    document.getElementById('tpl-category').innerHTML = cats
      .map((c) => `<option value="${c.name}">${c.icon} ${c.name}</option>`)
      .join('');
    document.getElementById('tpl-member').innerHTML = mems
      .map((m) => `<option value="${m.name}">${m.name}</option>`)
      .join('');

    const modal = document.getElementById('modal-template');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });

  document.getElementById('btn-close-tpl-modal').addEventListener('click', () => {
    const modal = document.getElementById('modal-template');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });

  document.getElementById('form-template').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('tpl-name').value.trim();
    const amount = Number(document.getElementById('tpl-amount').value) || 0;
    const type = document.getElementById('tpl-type').value;
    const category = document.getElementById('tpl-category').value;
    const member = document.getElementById('tpl-member').value;
    const subcategory = document.getElementById('tpl-subcategory').value.trim();
    const note = document.getElementById('tpl-note').value.trim();
    const isMonthlyFixed = document.getElementById('tpl-is-fixed').checked;

    const list = Storage.getTemplates();
    list.push({
      id: `tpl-${Date.now()}`,
      name,
      type,
      category,
      subcategory,
      amount,
      member,
      note: note || name,
      isMonthlyFixed,
      dayOfMonth: 5
    });
    Storage.saveTemplates(list);

    document.getElementById('form-template').reset();
    document.getElementById('modal-template').classList.add('hidden');
    document.getElementById('modal-template').classList.remove('flex');
    renderAll();
    await Api.syncSettingsToCloud();
    showToast(`⚡ 已新增常用模板「${name}」`);
  });

  // Tab 3 新增家庭成員
  document.getElementById('btn-add-member').addEventListener('click', async () => {
    const input = document.getElementById('input-new-member');
    const name = input.value.trim();
    if (!name) return;
    const list = Storage.getMembers();
    if (list.some((m) => m.name === name)) {
      showToast('此成員名稱已存在');
      return;
    }
    list.push({
      id: `member-${Date.now()}`,
      name,
      color: '#0EA5E9',
      bg: '#F0F9FF',
      icon: '👤'
    });
    Storage.saveMembers(list);
    input.value = '';
    renderAll();
    await Api.syncSettingsToCloud();
    showToast(`已新增成員「${name}」`);
  });

  // Tab 4 Face ID 綁定與測試
  document.getElementById('btn-setup-faceid').addEventListener('click', async () => {
    try {
      const settings = Storage.getSettings();
      await Auth.registerFaceId(settings.defaultMember || 'Willie');
      renderSettingsView();
      showToast('🔐 已成功綁定本機 Face ID！下次開啟將使用生物辨識保護');
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });

  document.getElementById('btn-test-lock').addEventListener('click', () => {
    const settings = Storage.getSettings();
    if (!settings.faceIdEnabled && !settings.passcode) {
      showToast('請先綁定 Face ID 或設定家庭通行碼後再測試鎖定');
      return;
    }
    Auth.lockSession();
    const lockScreen = document.getElementById('lock-screen');
    lockScreen.classList.remove('hidden');
    lockScreen.classList.add('flex');
  });

  document.getElementById('btn-disable-faceid').addEventListener('click', () => {
    Auth.disableFaceId();
    renderSettingsView();
    showToast('已關閉 Face ID 鎖定');
  });

  // Tab 4 跨手機換機 QR Code 與移轉碼
  document.getElementById('btn-show-migration-qr').addEventListener('click', () => {
    const targetMember = document.getElementById('migration-target-member').value;
    const migUrl = Storage.generateMigrationUrl(targetMember);
    const container = document.getElementById('migration-qr-container');
    const canvasEl = document.getElementById('qrcode-canvas');
    canvasEl.innerHTML = '';
    container.classList.remove('hidden');

    if (window.QRCode) {
      new window.QRCode(canvasEl, {
        text: migUrl,
        width: 180,
        height: 180,
        colorDark: '#1E1B4B',
        colorLight: '#FFFFFF'
      });
    } else {
      canvasEl.innerHTML = `<p class="text-xs text-slate-500 break-all">${migUrl}</p>`;
    }
  });

  document.getElementById('btn-copy-migration-code').addEventListener('click', async () => {
    const targetMember = document.getElementById('migration-target-member').value;
    const code = Storage.generateMigrationCode(targetMember);
    try {
      await navigator.clipboard.writeText(code);
      showToast(`📋 已複製「${targetMember}」專屬換機移轉碼！可貼到新手機還原`);
    } catch {
      window.prompt('請複製下方換機移轉碼：', code);
    }
  });

  document.getElementById('btn-apply-migration').addEventListener('click', async () => {
    const raw = document.getElementById('input-import-migration').value;
    try {
      const updated = Storage.applyMigrationCode(raw);
      document.getElementById('input-import-migration').value = '';
      renderAll();
      showToast(`🎉 換機設定匯入成功！預設記帳人：${updated.defaultMember}`);
      if (Api.isConfigured()) {
        await triggerCloudSync(false);
      }
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });

  // Tab 4 儲存 Google Sheet 設定
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const gasUrl = document.getElementById('setting-gas-url').value.trim();
    const passcode = document.getElementById('setting-passcode').value.trim();
    const defaultMember = document.getElementById('setting-default-member').value;
    const monthlyBudget = Number(document.getElementById('setting-monthly-budget').value) || 80000;

    Storage.saveSettings({
      gasUrl,
      passcode,
      defaultMember,
      monthlyBudget
    });

    renderAll();
    if (gasUrl) {
      await triggerCloudSync(false);
    } else {
      showToast('✅ 設定已儲存於本機');
    }
  });

  // 匯出 CSV / JSON 與清除範例
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const txs = Storage.getTransactions();
    const headers = ['ID', '日期', '類型', '主分類', '子分類', '金額', '成員', '備註'];
    const rows = txs.map((t) => [
      t.id,
      t.date,
      t.type === 'income' ? '收入' : '支出',
      t.category,
      t.subcategory || '',
      t.amount,
      t.member,
      `"${String(t.note || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(`WC_Family_Ledger_${getTodayDateStr()}.csv`, csvContent, 'text/csv;charset=utf-8;');
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const jsonStr = Storage.exportFullBackupJson();
    downloadFile(`WC_Family_Backup_${getTodayDateStr()}.json`, jsonStr, 'application/json');
  });

  document.getElementById('btn-clear-demo').addEventListener('click', () => {
    if (!window.confirm('確定要清空目前的本機帳目紀錄，從零開始記帳嗎？')) return;
    Storage.saveTransactions([]);
    Storage.saveSettings({ isDemoData: false });
    renderAll();
    showToast('🗑️ 已清空本機範例帳目');
  });
}

function renderCategoryModalPickers() {
  const iconEl = document.getElementById('cat-icon-picker');
  iconEl.innerHTML = CATEGORY_ICON_CHOICES.map(
    (ic) => `
    <button type="button" data-pick-icon="${ic}" class="h-9 w-9 rounded-xl text-lg flex items-center justify-center border ${
      State.catForm.icon === ic ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-slate-50'
    }">${ic}</button>
  `
  ).join('');

  iconEl.querySelectorAll('[data-pick-icon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.catForm.icon = btn.getAttribute('data-pick-icon');
      renderCategoryModalPickers();
    });
  });

  const colorEl = document.getElementById('cat-color-picker');
  colorEl.innerHTML = CATEGORY_COLOR_CHOICES.map(
    (col) => `
    <button type="button" data-pick-color="${col}" class="h-7 w-7 rounded-full border-2 ${
      State.catForm.color === col ? 'border-slate-900 scale-110' : 'border-transparent'
    }" style="background-color: ${col}"></button>
  `
  ).join('');

  colorEl.querySelectorAll('[data-pick-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.catForm.color = btn.getAttribute('data-pick-color');
      renderCategoryModalPickers();
    });
  });
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 註冊 PWA Service Worker 並啟動應用程式
 */
async function bootstrap() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      // ignore SW error on file://
    }
  }

  bindEvents();
  await checkUrlMigrationOnBoot();
  renderAll();
  await initFaceIdGuard();

  // 若已設定 Google Sheet 連線，背景自動同步最新帳務
  if (Api.isConfigured()) {
    triggerCloudSync(true);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
