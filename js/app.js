import { CATEGORY_ICON_CHOICES } from './defaultData.js?v=10';
import { renderIcon, HARMONIOUS_TONAL_SCALE } from './icons.js?v=10';
import { Storage } from './storage.js?v=10';
import { Auth } from './auth.js?v=10';
import { Api } from './api.js?v=10';

const PUBLIC_HTTPS_URL = 'https://day1211.github.io/family-accounting-system/';

const State = {
  activeTab: 'dashboard',
  dashboardMode: 'monthly', // 'monthly' | 'annual'
  currentYearMonth: getTodayYearMonth(),
  expandedCategory: null,
  syncStatus: 'idle',
  txForm: {
    id: '',
    type: 'expense',
    category: '餐飲食品',
    subcategory: '日常三餐',
    amount: '',
    date: getTodayDateStr(),
    note: ''
  },
  catForm: {
    icon: 'utensils'
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

function showToast(msg, duration = 3000) {
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

async function checkUrlMigrationOnBoot() {
  const params = new URLSearchParams(window.location.search);
  const setupCode = params.get('setup');
  if (!setupCode) return;

  try {
    Storage.applyMigrationCode(setupCode);
    Auth.markSessionUnlocked();
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    showToast('已成功匯入家庭帳本連線設定，正在自動同步雲端...', 4000);
  } catch (err) {
    showToast(`配對連結解析失敗：${err.message}`, 4000);
  }
}

function showUnlockedAppUI() {
  const lockScreen = document.getElementById('lock-screen');
  const mainContainer = document.getElementById('app-main-container');
  if (lockScreen) {
    lockScreen.classList.add('hidden');
    lockScreen.classList.remove('flex');
  }
  if (mainContainer) {
    mainContainer.classList.remove('hidden');
    mainContainer.classList.add('flex');
  }
  renderAll();
  performAutoSync(false);
}

function showLockedScreenUI() {
  const lockScreen = document.getElementById('lock-screen');
  const mainContainer = document.getElementById('app-main-container');
  if (mainContainer) {
    mainContainer.classList.add('hidden');
    mainContainer.classList.remove('flex');
  }
  if (lockScreen) {
    lockScreen.classList.remove('hidden');
    lockScreen.classList.add('flex');
  }
}

async function initFaceIdGuard() {
  if (Auth.isSessionUnlocked()) {
    showUnlockedAppUI();
    return;
  }

  showLockedScreenUI();

  const settings = Storage.getSettings();
  const hintEl = document.getElementById('lock-faceid-hint');
  const errEl = document.getElementById('lock-error-msg');
  if (hintEl) hintEl.textContent = '點擊使用 Face ID (iOS 通行密鑰) 解鎖';
  if (errEl) errEl.textContent = '';

  const isStandalonePwa =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  // 若已啟用 Face ID 或從 iPhone 桌面主畫面開啟，自動喚起 iOS 通行密鑰 Face ID
  if (settings.faceIdEnabled || isStandalonePwa) {
    setTimeout(() => {
      handleFaceIdUnlock();
    }, 300);
  }
}

async function handleFaceIdUnlock() {
  const errEl = document.getElementById('lock-error-msg');
  if (errEl) errEl.textContent = '正在喚起 iOS 通行密鑰 (Face ID) 驗證...';
  try {
    const ok = await Auth.verifyFaceId();
    if (ok) {
      if (errEl) errEl.textContent = '';
      showUnlockedAppUI();
      showToast('Face ID (iOS 通行密鑰) 解鎖成功');
    }
  } catch {
    if (errEl) {
      errEl.textContent = '可再次點擊上方圖示使用 Face ID，或於下方輸入密碼解鎖';
    }
  }
}

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
    btn.classList.toggle('text-indigo-950', isCurrent);
    btn.classList.toggle('font-bold', isCurrent);
    btn.classList.toggle('text-slate-400', !isCurrent);
    btn.classList.toggle('font-medium', !isCurrent);
  });

  renderAll();
}

function setDashboardMode(mode) {
  State.dashboardMode = mode;
  const btnMonthly = document.getElementById('btn-mode-monthly');
  const btnAnnual = document.getElementById('btn-mode-annual');
  const panelMonthly = document.getElementById('dashboard-monthly-panel');
  const panelAnnual = document.getElementById('dashboard-annual-panel');

  const isMonthly = mode === 'monthly';
  btnMonthly.className = isMonthly
    ? 'rounded-xl py-1.5 text-xs font-extrabold bg-white text-slate-900 shadow-sm transition'
    : 'rounded-xl py-1.5 text-xs font-extrabold text-slate-500 hover:text-slate-800 transition';
  btnAnnual.className = !isMonthly
    ? 'rounded-xl py-1.5 text-xs font-extrabold bg-white text-slate-900 shadow-sm transition'
    : 'rounded-xl py-1.5 text-xs font-extrabold text-slate-500 hover:text-slate-800 transition';

  panelMonthly.classList.toggle('hidden', !isMonthly);
  panelAnnual.classList.toggle('hidden', isMonthly);
  renderAll();
}

function shiftPeriod(delta) {
  const [y, m] = State.currentYearMonth.split('-').map(Number);
  if (State.activeTab === 'dashboard' && State.dashboardMode === 'annual') {
    const ny = y + delta;
    State.currentYearMonth = `${ny}-${String(m).padStart(2, '0')}`;
  } else {
    const d = new Date(y, m - 1 + delta, 1);
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    State.currentYearMonth = `${ny}-${nm}`;
  }
  renderAll();
}

function formatYearMonthLabel(ym) {
  const [y, m] = ym.split('-');
  if (State.activeTab === 'dashboard' && State.dashboardMode === 'annual') {
    return `${y} 年度`;
  }
  return `${y}年 ${Number(m)}月`;
}

function renderAll() {
  renderHeaderAndSyncBadge();
  renderDashboard();
  renderAnnualReport();
  renderSearchView();
  renderManageView();
  renderSettingsView();
}

function renderHeaderAndSyncBadge() {
  const settings = Storage.getSettings();
  const members = Storage.getMembers();
  const monthLabel = document.getElementById('current-month-label');
  if (monthLabel) monthLabel.textContent = formatYearMonthLabel(State.currentYearMonth);

  const memberNames = members.map((m) => m.name).join(' & ');
  const subEl = document.getElementById('header-subtitle');
  if (subEl) subEl.textContent = `${memberNames} 家庭收支帳本`;

  const badge = document.getElementById('sync-status-badge');
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  const heroSyncTime = document.getElementById('hero-sync-time');
  if (!badge || !dot || !text) return;

  if (State.syncStatus === 'syncing') {
    badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60';
    dot.className = 'h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping';
    text.textContent = '雲端同步中...';
    if (heroSyncTime) heroSyncTime.textContent = '正在與 Google Sheet 同步...';
  } else if (State.syncStatus === 'synced') {
    badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200/60';
    dot.className = 'h-1.5 w-1.5 rounded-full bg-indigo-600';
    text.textContent = '雲端自動同步';
    if (heroSyncTime) heroSyncTime.textContent = '已與 Google Sheet 即時同步';
  } else if (State.syncStatus === 'error') {
    badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200';
    dot.className = 'h-1.5 w-1.5 rounded-full bg-rose-500';
    text.textContent = '點擊重試同步';
    if (heroSyncTime) heroSyncTime.textContent = State.lastSyncError || '同步未完成，請點擊重試';
  } else if (State.syncStatus === 'pending_auth') {
    badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-700';
    dot.className = 'h-1.5 w-1.5 rounded-full bg-slate-500';
    text.textContent = '待試算表授權';
    if (heroSyncTime) heroSyncTime.textContent = '本機自動儲存（待試算表初次授權後自動同步）';
  } else {
    badge.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-200/80 text-slate-600';
    dot.className = 'h-1.5 w-1.5 rounded-full bg-slate-400';
    text.textContent = settings.isDemoData ? '自動同步就緒' : '本機模式';
  }
}

/**
 * 渲染 Tab 1 子視角 A: 月度收支概覽
 */
function renderDashboard() {
  const allTx = Storage.getTransactions();
  const categories = Storage.getCategories();
  const settings = Storage.getSettings();
  const ym = State.currentYearMonth;

  const monthTx = allTx
    .filter((t) => String(t.date || '').startsWith(ym))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  let totalExpense = 0;
  let totalIncome = 0;
  const catExpenseMap = {};
  const subcatExpenseMap = {};

  monthTx.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      if (!catExpenseMap[t.category]) {
        catExpenseMap[t.category] = { amount: 0, count: 0 };
      }
      catExpenseMap[t.category].amount += amt;
      catExpenseMap[t.category].count += 1;

      const subKey = `${t.category}__${t.subcategory || '一般'}`;
      subcatExpenseMap[subKey] = (subcatExpenseMap[subKey] || 0) + amt;
    }
  });

  const netBalance = totalIncome - totalExpense;
  const [y, m] = ym.split('-');
  document.getElementById('hero-month-title').textContent = `${y}年 ${Number(m)}月 家庭總支出`;
  document.getElementById('hero-total-expense').textContent = formatCurrency(totalExpense);
  document.getElementById('hero-total-income').textContent = formatCurrency(totalIncome);

  const netEl = document.getElementById('hero-net-balance');
  netEl.textContent = (netBalance >= 0 ? '+' : '-') + formatCurrency(Math.abs(netBalance));
  netEl.className = `text-sm font-bold tabular-nums ${netBalance >= 0 ? 'text-indigo-100' : 'text-rose-200'}`;

  const budget = Number(settings.monthlyBudget) || 80000;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((totalExpense / budget) * 100)) : 0;
  document.getElementById('hero-budget-percent').textContent = `${budgetPct}%`;
  document.getElementById('hero-budget-bar').style.width = `${budgetPct}%`;

  const breakdownItems = Object.keys(catExpenseMap)
    .map((catName) => {
      const found = categories.find((c) => c.name === catName) || {
        name: catName,
        icon: 'tag'
      };
      const amount = catExpenseMap[catName].amount;
      const count = catExpenseMap[catName].count;
      const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
      return {
        name: catName,
        icon: found.icon || 'tag',
        amount,
        count,
        pct
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .map((item, idx) => ({
      ...item,
      toneColor: HARMONIOUS_TONAL_SCALE[idx % HARMONIOUS_TONAL_SCALE.length]
    }));

  const allocBar = document.getElementById('allocation-bar');
  const catList = document.getElementById('category-breakdown-list');

  if (breakdownItems.length === 0) {
    allocBar.innerHTML = `<div class="w-full h-full bg-slate-100 rounded-full"></div>`;
    catList.innerHTML = `
      <div class="py-6 text-center text-xs text-slate-400">
        本月尚無支出紀錄，點擊下方「＋」開始記帳
      </div>
    `;
  } else {
    allocBar.innerHTML = breakdownItems
      .map(
        (item) =>
          `<div class="allocation-bar-segment" style="width: ${Math.max(item.pct, 3)}%; background-color: ${item.toneColor};" title="${item.name}: ${item.pct.toFixed(1)}%"></div>`
      )
      .join('');

    catList.innerHTML = breakdownItems
      .map((item) => {
        const isExpanded = State.expandedCategory === item.name;
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
          <div class="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 transition">
            <div class="flex items-center justify-between cursor-pointer" data-toggle-cat="${item.name}">
              <div class="flex items-center gap-3">
                <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200/70 text-slate-700">
                  ${renderIcon(item.icon, 'w-4 h-4')}
                </span>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="h-2 w-2 rounded-full" style="background-color: ${item.toneColor}"></span>
                    <span class="text-xs font-extrabold text-slate-800">${item.name}</span>
                    <span class="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200/70 tabular-nums">${item.pct.toFixed(1)}%</span>
                  </div>
                  <span class="text-[11px] text-slate-400 block mt-0.5">${item.count} 筆紀錄</span>
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
                    <span class="text-slate-600 font-medium">${s.subName}</span>
                    <div class="flex items-center gap-2.5 tabular-nums">
                      <span class="text-[11px] text-slate-400">${s.sPct}%</span>
                      <span class="font-bold text-slate-800">${formatCurrency(s.sAmt)}</span>
                    </div>
                  </div>
                `
                  )
                  .join('')}
                <div class="pt-1 text-right">
                  <button type="button" data-filter-cat="${item.name}" class="text-[11px] font-bold text-slate-600 hover:text-slate-950">
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

  const recentEl = document.getElementById('recent-transactions-list');
  const recentSlice = monthTx.slice(0, 8);
  if (recentSlice.length === 0) {
    recentEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">本月尚無帳目紀錄</div>`;
  } else {
    recentEl.innerHTML = recentSlice.map((tx) => renderTransactionRowHtml(tx, categories)).join('');
    bindTransactionRowClicks(recentEl);
  }
}

/**
 * 渲染 Tab 1 子視角 B: 年度 1-12 月收支總表 (Annual Report Matrix)
 */
function renderAnnualReport() {
  const year = State.currentYearMonth.slice(0, 4);
  const allTx = Storage.getTransactions();
  const categories = Storage.getCategories();

  const yearTx = allTx.filter((t) => String(t.date || '').startsWith(`${year}-`));

  const incomeCats = categories.filter((c) => c.type === 'income').map((c) => c.name);
  const expenseCats = categories.filter((c) => c.type === 'expense').map((c) => c.name);

  // 補入歷史交易中可能出現但不在預設清單中的分類
  yearTx.forEach((t) => {
    if (t.type === 'income' && !incomeCats.includes(t.category)) incomeCats.push(t.category);
    if (t.type !== 'income' && !expenseCats.includes(t.category)) expenseCats.push(t.category);
  });

  // 初始化 1~12 月統計矩陣 (index 0~11 對應 1~12月)
  const incMatrix = {};
  incomeCats.forEach((c) => {
    incMatrix[c] = Array(12).fill(0);
  });
  const expMatrix = {};
  expenseCats.forEach((c) => {
    expMatrix[c] = Array(12).fill(0);
  });

  const monthlyIncTotals = Array(12).fill(0);
  const monthlyExpTotals = Array(12).fill(0);

  yearTx.forEach((t) => {
    const mIdx = Number(String(t.date || '').slice(5, 7)) - 1;
    if (mIdx < 0 || mIdx > 11) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      if (!incMatrix[t.category]) incMatrix[t.category] = Array(12).fill(0);
      incMatrix[t.category][mIdx] += amt;
      monthlyIncTotals[mIdx] += amt;
    } else {
      if (!expMatrix[t.category]) expMatrix[t.category] = Array(12).fill(0);
      expMatrix[t.category][mIdx] += amt;
      monthlyExpTotals[mIdx] += amt;
    }
  });

  const grandIncome = monthlyIncTotals.reduce((a, b) => a + b, 0);
  const grandExpense = monthlyExpTotals.reduce((a, b) => a + b, 0);
  const grandNet = grandIncome - grandExpense;

  document.getElementById('annual-hero-title').textContent = `${year} 年度家庭收支總覽 (1-12月)`;
  document.getElementById('annual-total-income').textContent = formatCurrency(grandIncome);
  document.getElementById('annual-total-expense').textContent = formatCurrency(grandExpense);
  const netEl = document.getElementById('annual-net-balance');
  netEl.textContent = (grandNet >= 0 ? '+' : '-') + formatCurrency(Math.abs(grandNet));
  netEl.className = `text-sm font-extrabold tabular-nums mt-0.5 block ${
    grandNet >= 0 ? 'text-indigo-100' : 'text-rose-200'
  }`;

  // 產生 1~12 月矩陣表格 HTML
  const monthHeaders = Array.from({ length: 12 }, (_, i) => `<th class="py-2 px-2 text-right font-bold">${i + 1}月</th>`).join('');

  const renderCatRow = (catName, arr, grandTypeTotal) => {
    const rowSum = arr.reduce((a, b) => a + b, 0);
    const rowAvg = Math.round(rowSum / 12);
    const pct = grandTypeTotal > 0 ? ((rowSum / grandTypeTotal) * 100).toFixed(1) + '%' : '0.0%';
    const cells = arr
      .map((val) => `<td class="py-2 px-2 text-right ${val > 0 ? 'text-slate-700' : 'text-slate-300'}">${val > 0 ? val.toLocaleString() : '-'}</td>`)
      .join('');
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80">
        <td class="py-2 pr-3 font-semibold text-slate-800 sticky left-0 bg-white">${catName}</td>
        ${cells}
        <td class="py-2 px-2 text-right font-extrabold text-slate-900 bg-slate-50/70">${formatCurrency(rowSum)}</td>
        <td class="py-2 px-2 text-right text-slate-500">${formatCurrency(rowAvg)}</td>
        <td class="py-2 pl-2 text-right text-slate-500">${pct}</td>
      </tr>
    `;
  };

  const incRowsHtml = incomeCats.map((c) => renderCatRow(c, incMatrix[c], grandIncome)).join('');
  const expRowsHtml = expenseCats.map((c) => renderCatRow(c, expMatrix[c], grandExpense)).join('');

  const totalIncCells = monthlyIncTotals
    .map((v) => `<td class="py-2 px-2 text-right font-bold">${v > 0 ? v.toLocaleString() : '-'}</td>`)
    .join('');
  const totalExpCells = monthlyExpTotals
    .map((v) => `<td class="py-2 px-2 text-right font-bold">${v > 0 ? v.toLocaleString() : '-'}</td>`)
    .join('');
  const netCells = monthlyIncTotals
    .map((inc, i) => {
      const net = inc - monthlyExpTotals[i];
      if (inc === 0 && monthlyExpTotals[i] === 0) {
        return `<td class="py-2 px-2 text-right text-slate-300">-</td>`;
      }
      return `<td class="py-2 px-2 text-right font-bold ${net >= 0 ? 'text-indigo-900' : 'text-rose-600'}">${net.toLocaleString()}</td>`;
    })
    .join('');

  const tableEl = document.getElementById('annual-matrix-table');
  tableEl.innerHTML = `
    <thead>
      <tr class="border-b-2 border-slate-200 text-slate-500 bg-slate-50">
        <th class="py-2 pr-3 font-extrabold text-slate-800 sticky left-0 bg-slate-50">分類項目</th>
        ${monthHeaders}
        <th class="py-2 px-2 text-right font-extrabold text-slate-900">全年合計</th>
        <th class="py-2 px-2 text-right font-bold">月平均</th>
        <th class="py-2 pl-2 text-right font-bold">佔比</th>
      </tr>
    </thead>
    <tbody>
      ${incRowsHtml}
      <tr class="bg-indigo-50/70 text-indigo-950 border-b border-indigo-100">
        <td class="py-2 pr-3 font-extrabold sticky left-0 bg-indigo-50">【家庭總收入】</td>
        ${totalIncCells}
        <td class="py-2 px-2 text-right font-extrabold">${formatCurrency(grandIncome)}</td>
        <td class="py-2 px-2 text-right font-bold">${formatCurrency(grandIncome / 12)}</td>
        <td class="py-2 pl-2 text-right font-bold">100%</td>
      </tr>
      ${expRowsHtml}
      <tr class="bg-slate-100 text-slate-900 border-b border-slate-200">
        <td class="py-2 pr-3 font-extrabold sticky left-0 bg-slate-100">【家庭總支出】</td>
        ${totalExpCells}
        <td class="py-2 px-2 text-right font-extrabold">${formatCurrency(grandExpense)}</td>
        <td class="py-2 px-2 text-right font-bold">${formatCurrency(grandExpense / 12)}</td>
        <td class="py-2 pl-2 text-right font-bold">100%</td>
      </tr>
      <tr class="bg-slate-50 border-t-2 border-slate-300">
        <td class="py-2.5 pr-3 font-extrabold text-slate-900 sticky left-0 bg-slate-50">【每月淨結餘】</td>
        ${netCells}
        <td class="py-2.5 px-2 text-right font-extrabold ${grandNet >= 0 ? 'text-indigo-900' : 'text-rose-600'}">${formatCurrency(grandNet)}</td>
        <td class="py-2.5 px-2 text-right font-bold">${formatCurrency(grandNet / 12)}</td>
        <td class="py-2.5 pl-2 text-right font-bold">${grandIncome > 0 ? Math.round((grandNet / grandIncome) * 100) + '%' : '-'}</td>
      </tr>
    </tbody>
  `;
}

function renderTransactionRowHtml(tx, categories) {
  const catObj = categories.find((c) => c.name === tx.category) || {
    icon: tx.type === 'income' ? 'wallet' : 'tag'
  };
  const isIncome = tx.type === 'income';

  return `
    <div data-tx-id="${tx.id}" class="py-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 rounded-xl px-1 transition">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          ${renderIcon(catObj.icon || 'tag', 'w-4 h-4')}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-extrabold text-slate-900 truncate">${tx.category}${tx.subcategory ? ` · ${tx.subcategory}` : ''}</span>
          </div>
          <p class="text-[11px] text-slate-400 truncate mt-0.5">
            ${tx.note ? tx.note : '無備註'} <span class="text-slate-300">·</span> ${tx.date}
          </p>
        </div>
      </div>
      <div class="text-right shrink-0">
        <span class="text-sm font-extrabold tabular-nums ${isIncome ? 'text-indigo-700' : 'text-slate-900'}">
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

function populateSearchFilterDropdowns() {
  const categories = Storage.getCategories();
  const catSelect = document.getElementById('filter-category');
  if (!catSelect) return;
  const currentCat = catSelect.value || 'all';
  catSelect.innerHTML =
    `<option value="all">全部主分類</option>` +
    categories.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
  if ([...catSelect.options].some((o) => o.value === currentCat)) {
    catSelect.value = currentCat;
  }
}

function renderSearchView() {
  populateSearchFilterDropdowns();
  const allTx = Storage.getTransactions();
  const categories = Storage.getCategories();

  const keyword = (document.getElementById('search-keyword').value || '').trim().toLowerCase();
  const scope = document.getElementById('filter-scope').value;
  const typeFilter = document.getElementById('filter-type').value;
  const catFilter = document.getElementById('filter-category').value;

  const filtered = allTx
    .filter((tx) => {
      if (scope === 'current' && !String(tx.date || '').startsWith(State.currentYearMonth)) {
        return false;
      }
      if (typeFilter !== 'all' && tx.type !== typeFilter) {
        return false;
      }
      if (catFilter !== 'all' && tx.category !== catFilter) {
        return false;
      }
      if (keyword) {
        const hay = `${tx.category} ${tx.subcategory} ${tx.note} ${tx.date} ${tx.amount}`.toLowerCase();
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
    listEl.innerHTML = filtered.map((tx) => renderTransactionRowHtml(tx, categories)).join('');
    bindTransactionRowClicks(listEl);
  }
}

function renderManageView() {
  const templates = Storage.getTemplates();
  const categories = Storage.getCategories();
  const members = Storage.getMembers();

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
                ? `<span class="rounded-md bg-slate-200/90 text-slate-700 px-1.5 py-0.5 text-[10px] font-bold">每月固定</span>`
                : ''
            }
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">${tpl.category}${tpl.subcategory ? ` · ${tpl.subcategory}` : ''} · ${formatCurrency(tpl.amount)}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" data-use-tpl="${tpl.id}" class="rounded-xl bg-indigo-950 text-white px-2.5 py-1.5 text-[11px] font-bold">
            記一筆
          </button>
          <button type="button" data-del-tpl="${tpl.id}" class="rounded-xl bg-slate-200/70 text-slate-600 hover:text-rose-600 px-2 py-1.5 text-[11px] font-bold">
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

  const catListEl = document.getElementById('manage-categories-list');
  catListEl.innerHTML = categories
    .map(
      (cat) => `
    <div class="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200/70 text-slate-700">
            ${renderIcon(cat.icon || 'tag', 'w-4 h-4')}
          </span>
          <div>
            <span class="text-xs font-extrabold text-slate-900">${cat.name}</span>
            <span class="ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold bg-slate-200/80 text-slate-600">
              ${cat.type === 'income' ? '收入' : '支出'}
            </span>
          </div>
        </div>
        <button type="button" data-del-cat="${cat.id}" class="text-[11px] font-semibold text-slate-400 hover:text-rose-600">
          刪除
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 pt-1">
        ${(cat.subcategories || [])
          .map(
            (sub) => `
          <span class="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            ${sub}
            <button type="button" data-del-sub="${cat.id}__${sub}" class="text-slate-400 hover:text-rose-600 ml-0.5">×</button>
          </span>
        `
          )
          .join('')}
        <button type="button" data-add-sub="${cat.id}" class="rounded-full bg-slate-200/70 text-slate-700 px-2.5 py-1 text-[11px] font-bold hover:bg-slate-300/70">
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
      if (target && !target.subcategories.includes(subName.trim())) {
        target.subcategories.push(subName.trim());
        Storage.saveCategories(cats);
        renderAll();
        await Api.syncSettingsToCloud();
        showToast(`已新增子分類「${subName.trim()}」`);
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

  const memListEl = document.getElementById('manage-members-list');
  memListEl.innerHTML = members
    .map(
      (m) => `
    <div class="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200/70 px-3 py-2">
      <div class="flex items-center gap-2 text-slate-700">
        ${renderIcon('user', 'w-4 h-4')}
        <span class="text-xs font-extrabold text-slate-800">${m.name}</span>
      </div>
      <button type="button" data-rename-mem="${m.id}" class="text-[11px] font-semibold text-slate-600 hover:text-slate-950">
        修改稱呼
      </button>
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
      const newName = window.prompt('請輸入新的稱呼：', target.name);
      if (!newName || !newName.trim()) return;
      target.name = newName.trim();
      Storage.saveMembers(list);
      renderAll();
      await Api.syncSettingsToCloud();
      showToast(`已更新稱呼為「${target.name}」`);
    });
  });
}

function renderSettingsView() {
  const settings = Storage.getSettings();
  const members = Storage.getMembers();

  const badge = document.getElementById('faceid-badge');
  const btnDisable = document.getElementById('btn-disable-faceid');
  const btnSetup = document.getElementById('btn-setup-faceid');

  if (settings.faceIdEnabled) {
    badge.textContent = '已啟用 Face ID';
    badge.className = 'rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/70';
    btnDisable.classList.remove('hidden');
    btnSetup.textContent = '重新綁定本機 Face ID';
  } else {
    badge.textContent = '未啟用';
    badge.className = 'rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600';
    btnDisable.classList.add('hidden');
    btnSetup.textContent = '啟用 / 綁定本機 Face ID';
  }

  const migMemSelect = document.getElementById('migration-target-member');
  migMemSelect.innerHTML = members
    .map((m) => `<option value="${m.name}">${m.name} 的手機</option>`)
    .join('');

  document.getElementById('setting-gas-url').value = settings.gasUrl || '';
  document.getElementById('setting-passcode').value = settings.passcode || '';
  document.getElementById('setting-monthly-budget').value = settings.monthlyBudget || 80000;
}

function openTransactionModal(editTxId = '', templateId = '') {
  const categories = Storage.getCategories();
  const templates = Storage.getTemplates();

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
  const templates = Storage.getTemplates();

  const quickTplEl = document.getElementById('modal-quick-templates');
  quickTplEl.innerHTML = templates
    .map(
      (t) => `
    <button type="button" data-quick-tpl="${t.id}" class="shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 px-3 py-1 text-[11px] font-bold transition">
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
      State.txForm.amount = tpl.amount;
      State.txForm.note = tpl.note || tpl.name;
      renderTxModalFields();
    });
  });

  document.querySelectorAll('.tx-type-btn').forEach((btn) => {
    const isSelected = btn.getAttribute('data-tx-type') === State.txForm.type;
    btn.className = isSelected
      ? 'tx-type-btn rounded-xl py-2 text-xs font-extrabold bg-white text-slate-900 shadow-sm transition'
      : 'tx-type-btn rounded-xl py-2 text-xs font-extrabold text-slate-500 transition';
  });

  document.getElementById('tx-id').value = State.txForm.id;
  document.getElementById('tx-amount').value = State.txForm.amount;
  document.getElementById('tx-date').value = State.txForm.date;
  document.getElementById('tx-note').value = State.txForm.note;

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
      <button type="button" data-pick-cat="${c.name}" class="flex flex-col items-center justify-center rounded-2xl p-2.5 border text-center transition ${
        active
          ? 'bg-indigo-950 text-white border-indigo-950 shadow-sm'
          : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100'
      }">
        ${renderIcon(c.icon || 'tag', 'w-5 h-5')}
        <span class="text-[11px] font-bold mt-1.5 truncate w-full">${c.name}</span>
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
            ? 'bg-indigo-950 text-white border-indigo-950'
            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
        }">
          ${sub}
        </button>
      `;
      })
      .join('') +
    `
    <button type="button" id="btn-inline-add-sub" class="rounded-full px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
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

async function performAutoSync(silent = true) {
  if (!Auth.isSessionUnlocked() || !Api.isConfigured()) return;

  State.syncStatus = 'syncing';
  renderHeaderAndSyncBadge();

  try {
    await Api.syncWithCloud();
    State.syncStatus = 'synced';
    State.lastSyncError = null;
    renderAll();
    if (!silent) {
      showToast('已與 Google Sheet 完成自動同步');
    }
  } catch (err) {
    State.syncStatus = 'error';
    State.lastSyncError = err.message;
    renderHeaderAndSyncBadge();
    showToast(`雲端同步失敗: ${err.message}`, 5000);
  }
}

function startAutoSyncDaemon() {
  performAutoSync(true);

  setInterval(() => {
    if (document.visibilityState === 'visible') {
      performAutoSync(true);
    }
  }, 20000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      performAutoSync(true);
    }
  });
  window.addEventListener('focus', () => performAutoSync(true));
  window.addEventListener('online', () => performAutoSync(true));
}

async function handleApplyMonthlyFixedTemplates() {
  const templates = Storage.getTemplates().filter((t) => t.isMonthlyFixed);
  if (templates.length === 0) {
    showToast('目前沒有勾選為「每月固定」的模板，可至「分類/模板」設定');
    return;
  }

  const ym = State.currentYearMonth;
  if (!window.confirm(`確定要將 ${templates.length} 筆「每月固定收支」寫入 ${ym} 帳本嗎？`)) {
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
      note: tpl.note || tpl.name,
      createdAt: new Date().toISOString()
    };
  });

  Storage.saveTransactions([...createdList, ...allTx]);
  renderAll();
  showToast(`已寫入 ${createdList.length} 筆本月固定收支`);
  await Api.batchInsertTransactions(createdList);
  performAutoSync(true);
}

function bindEvents() {
  document.getElementById('btn-close-toast').addEventListener('click', () => {
    document.getElementById('toast-banner').classList.add('hidden');
  });

  document.getElementById('btn-trigger-faceid').addEventListener('click', () => {
    handleFaceIdUnlock();
  });

  const handlePasscodeSubmit = async () => {
    const inputEl = document.getElementById('input-unlock-passcode');
    const errEl = document.getElementById('lock-error-msg');
    const val = inputEl.value;
    if (!val || !val.trim()) {
      errEl.textContent = '請輸入家庭通行碼';
      return;
    }
    errEl.textContent = '正在驗證金鑰並解密雲端連線...';
    const ok = await Auth.verifyFallbackPasscode(val);
    if (ok) {
      inputEl.value = '';
      errEl.textContent = '';
      showUnlockedAppUI();
      showToast('家庭通行碼驗證成功，已自動連線雲端');
    } else {
      errEl.textContent = '家庭通行碼不正確，無法解鎖帳本';
    }
  };

  const formUnlock = document.getElementById('form-unlock-passcode');
  if (formUnlock) {
    formUnlock.addEventListener('submit', (e) => {
      e.preventDefault();
      handlePasscodeSubmit();
    });
  }
  document.getElementById('btn-unlock-passcode').addEventListener('click', (e) => {
    e.preventDefault();
    handlePasscodeSubmit();
  });

  document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // 月度 / 年度 1-12 月總表切換
  document.getElementById('btn-mode-monthly').addEventListener('click', () => setDashboardMode('monthly'));
  document.getElementById('btn-mode-annual').addEventListener('click', () => setDashboardMode('annual'));

  document.getElementById('btn-sync-annual-sheet').addEventListener('click', async () => {
    const year = Number(State.currentYearMonth.slice(0, 4));
    try {
      showToast(`正在為 Google Sheet 建立/更新「${year}_年度總表」...`);
      await Api.ensureAnnualSheet(year);
      showToast(`已在 Google Sheet 更新「${year}_年度總表 (1-12月)」分頁！`);
    } catch (err) {
      showToast(`${err.message}`);
    }
  });

  document.getElementById('btn-prev-month').addEventListener('click', () => shiftPeriod(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => shiftPeriod(1));

  document.getElementById('sync-status-badge').addEventListener('click', () => performAutoSync(false));

  document.getElementById('btn-nav-add').addEventListener('click', () => openTransactionModal());
  document.getElementById('btn-quick-open-add').addEventListener('click', () => openTransactionModal());
  document.getElementById('btn-close-tx-modal').addEventListener('click', closeTransactionModal);

  document.getElementById('btn-apply-monthly-fixed').addEventListener('click', handleApplyMonthlyFixedTemplates);
  document.getElementById('btn-jump-search').addEventListener('click', () => switchTab('search'));
  document.getElementById('btn-view-all-tx').addEventListener('click', () => switchTab('search'));
  document.getElementById('btn-open-cat-manager').addEventListener('click', () => switchTab('manage'));
  document.getElementById('btn-modal-jump-cat').addEventListener('click', () => {
    closeTransactionModal();
    switchTab('manage');
  });

  document.querySelectorAll('.tx-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.txForm.amount = document.getElementById('tx-amount').value;
      State.txForm.date = document.getElementById('tx-date').value;
      State.txForm.note = document.getElementById('tx-note').value;
      State.txForm.type = btn.getAttribute('data-tx-type');
      renderTxModalFields();
    });
  });

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
    showToast('已儲存收支並自動同步雲端');

    await Api.upsertTransaction(txObj);
    performAutoSync(true);
  });

  document.getElementById('btn-delete-tx').addEventListener('click', async () => {
    const id = State.txForm.id;
    if (!id) return;
    if (!window.confirm('確定要刪除這筆帳目嗎？')) return;

    const next = Storage.getTransactions().filter((t) => t.id !== id);
    Storage.saveTransactions(next);
    closeTransactionModal();
    renderAll();
    showToast('已刪除帳目並自動同步雲端');

    await Api.deleteTransaction(id);
    performAutoSync(true);
  });

  ['search-keyword', 'filter-scope', 'filter-type', 'filter-category'].forEach((id) => {
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
    document.getElementById('filter-category').value = 'all';
    renderSearchView();
  });

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
      icon: State.catForm.icon || 'tag',
      subcategories: subcategories.length > 0 ? subcategories : ['一般']
    });
    Storage.saveCategories(cats);

    document.getElementById('cat-name').value = '';
    document.getElementById('cat-subcategories').value = '';
    document.getElementById('modal-category').classList.add('hidden');
    document.getElementById('modal-category').classList.remove('flex');

    renderAll();
    await Api.syncSettingsToCloud();
    showToast(`已新增自訂主分類「${name}」`);
  });

  document.getElementById('btn-add-template').addEventListener('click', () => {
    const cats = Storage.getCategories();
    document.getElementById('tpl-category').innerHTML = cats
      .map((c) => `<option value="${c.name}">${c.name}</option>`)
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
    showToast(`已新增常用模板「${name}」`);
  });

  document.getElementById('btn-setup-faceid').addEventListener('click', async () => {
    try {
      const settings = Storage.getSettings();
      await Auth.registerFaceId(settings.defaultMember || 'Willie');
      renderSettingsView();
      showToast('已成功綁定本機 Face ID');
    } catch (err) {
      showToast(`${err.message}`);
    }
  });

  document.getElementById('btn-test-lock').addEventListener('click', () => {
    Auth.lockSession();
    initFaceIdGuard();
  });

  document.getElementById('btn-disable-faceid').addEventListener('click', () => {
    Auth.disableFaceId();
    renderSettingsView();
    showToast('已關閉 Face ID 鎖定');
  });

  // 顯示手機配對 QR Code（若在 localhost 則自動指向正式 HTTPS GitHub Pages 網址）
  document.getElementById('btn-show-migration-qr').addEventListener('click', () => {
    const targetMember = document.getElementById('migration-target-member').value;
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.');
    const baseUrl = isLocal ? PUBLIC_HTTPS_URL : window.location.href;
    const migUrl = Storage.generateMigrationUrl(targetMember, baseUrl);

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
      showToast(`已複製「${targetMember}」專屬換機移轉碼`);
    } catch {
      window.prompt('請複製下方換機移轉碼：', code);
    }
  });

  document.getElementById('btn-apply-migration').addEventListener('click', async () => {
    const raw = document.getElementById('input-import-migration').value;
    try {
      Storage.applyMigrationCode(raw);
      document.getElementById('input-import-migration').value = '';
      renderAll();
      showToast('換機設定匯入成功');
      performAutoSync(false);
    } catch (err) {
      showToast(`${err.message}`);
    }
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const gasUrl = document.getElementById('setting-gas-url').value.trim();
    const passcode = document.getElementById('setting-passcode').value.trim();
    const monthlyBudget = Number(document.getElementById('setting-monthly-budget').value) || 80000;

    Storage.saveSettings({
      gasUrl,
      passcode,
      monthlyBudget
    });

    renderAll();
    showToast('設定已儲存並開啟自動同步');
    performAutoSync(false);
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const txs = Storage.getTransactions();
    const headers = ['ID', '日期', '類型', '主分類', '子分類', '金額', '備註'];
    const rows = txs.map((t) => [
      t.id,
      t.date,
      t.type === 'income' ? '收入' : '支出',
      t.category,
      t.subcategory || '',
      t.amount,
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
    showToast('已清空本機範例帳目');
  });
}

function renderCategoryModalPickers() {
  const iconEl = document.getElementById('cat-icon-picker');
  iconEl.innerHTML = CATEGORY_ICON_CHOICES.map(
    (ic) => `
    <button type="button" data-pick-icon="${ic}" class="h-9 w-9 rounded-xl flex items-center justify-center border transition ${
      State.catForm.icon === ic
        ? 'border-indigo-950 bg-indigo-950 text-white'
        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
    }">
      ${renderIcon(ic, 'w-4 h-4')}
    </button>
  `
  ).join('');

  iconEl.querySelectorAll('[data-pick-icon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      State.catForm.icon = btn.getAttribute('data-pick-icon');
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

async function bootstrap() {
  bindEvents();
  await checkUrlMigrationOnBoot();
  await initFaceIdGuard();
  startAutoSyncDaemon();
}

document.addEventListener('DOMContentLoaded', bootstrap);
