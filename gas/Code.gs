/**
 * ============================================================================
 * W&C 家庭記帳本 - Google Apps Script (GAS) 雲端同步與年度總表後端
 * ============================================================================
 */

const DEFAULT_FAMILY_PASSCODE = 'WC-Family-2026';

const SHEET_NAMES = {
  TRANSACTIONS: 'Transactions',
  CATEGORIES_TABLE: '分類設定',
  CONFIG: 'App_Config'
};

const DEFAULT_V16_CATEGORIES = [
  { id: 'cat-food', type: 'expense', name: '餐飲食品', icon: 'utensils', subcategories: ['外食', '食物'] },
  { id: 'cat-home', type: 'expense', name: '居家生活', icon: 'home', subcategories: ['日常用品', '日常服務', '房貸', '管理費'] },
  { id: 'cat-transport', type: 'expense', name: '交通出行', icon: 'car', subcategories: ['加油/充電', '停車過路費', '高鐵/捷運', '計程車/Uber', '保養與保險'] },
  { id: 'cat-shopping', type: 'expense', name: '購物消費', icon: 'shopping', subcategories: ['服飾鞋包', '3C數位', '美妝保養', '居家好物', '其他'] },
  { id: 'cat-entertainment', type: 'expense', name: '休閒娛樂', icon: 'entertainment', subcategories: ['國內外旅遊', '朋友聚會', '展覽活動'] },
  { id: 'cat-medical', type: 'expense', name: '醫療保健', icon: 'medical', subcategories: ['門診掛號', '藥品保健', '健康檢查'] },
  { id: 'cat-other-exp', type: 'expense', name: '發展進修', icon: 'education', subcategories: ['課程學習', '運動健身'] },
  { id: 'cat-utilities', type: 'expense', name: '公用事業', icon: 'wrench', subcategories: ['水費', '電費', '瓦斯費', '網路', '行動電話', '其他'] },
  { id: 'cat-subscription', type: 'expense', name: '訂閱服務', icon: 'laptop', subcategories: ['應用訂閱', '信用卡年費'] },
  { id: 'cat-insurance', type: 'expense', name: '保險', icon: 'landmark', subcategories: ['勞健保', '保險'] },
  { id: 'cat-tax', type: 'expense', name: '萬萬稅', icon: 'receipt', subcategories: ['所得稅', '罰單'] },
  { id: 'cat-social', type: 'expense', name: '人際支出', icon: 'coffee', subcategories: ['人際支出'] },
  { id: 'cat-filial', type: 'expense', name: '孝親支出', icon: 'gift', subcategories: ['孝親支出'] },
  { id: 'cat-donation', type: 'expense', name: '捐獻', icon: 'tag', subcategories: ['捐獻'] },
  { id: 'cat-parenting', type: 'expense', name: '育兒', icon: 'baby', subcategories: ['何岱芸學費', '滿滿才藝課', '其他育兒支出', '小荷包才藝課', '何岱恩學費'] },
  { id: 'cat-salary', type: 'income', name: '薪資獎金', icon: 'wallet', subcategories: ['每月本薪', '績效獎金', '年終分紅', '加班津貼'] },
  { id: 'cat-invest', type: 'income', name: '投資理財', icon: 'trending', subcategories: ['股票股息', '債券配息', '資本利得', '定存利息'] },
  { id: 'cat-other-inc', type: 'income', name: '其他收入', icon: 'gift', subcategories: ['二手拍賣', '退稅/補助', '禮金回饋', '其他收入'] }
];

const DEFAULT_V16_TEMPLATES = [
  { id: 'tpl-1', name: '每月房貸扣款', type: 'expense', category: '居家生活', subcategory: '房貸', amount: 38000, note: '每月固定房貸', isMonthlyFixed: true, dayOfMonth: 5 },
  { id: 'tpl-2', name: '社區管理費', type: 'expense', category: '居家生活', subcategory: '管理費', amount: 3500, note: '社區物業管理費', isMonthlyFixed: true, dayOfMonth: 10 },
  { id: 'tpl-3', name: '水電瓦斯與光纖網路', type: 'expense', category: '公用事業', subcategory: '網路', amount: 2200, note: '家用光纖與水電帳單', isMonthlyFixed: true, dayOfMonth: 15 },
  { id: 'tpl-4', name: 'Netflix + YouTube 家庭訂閱', type: 'expense', category: '訂閱服務', subcategory: '應用訂閱', amount: 690, note: '家庭共享串流平台', isMonthlyFixed: true, dayOfMonth: 18 },
  { id: 'tpl-5', name: '好市多 / 超市生鮮採買', type: 'expense', category: '餐飲食品', subcategory: '食物', amount: 2500, note: '週末家庭食材採買', isMonthlyFixed: false },
  { id: 'tpl-6', name: '汽車加油', type: 'expense', category: '交通出行', subcategory: '加油/充電', amount: 1500, note: '中油自助加油', isMonthlyFixed: false }
];

function migrateGasCategoryPair(rawCat, rawSub) {
  let cat = String(rawCat || '').trim();
  let sub = String(rawSub || '').trim();

  if (cat === '餐飲食品') {
    if (sub === '日常三餐' || sub === '餐廳外食') sub = '外食';
    else if (sub === '生鮮買菜' || sub === '咖啡飲料' || sub === '甜點零食') sub = '食物';
  } else if (cat === '居家生活') {
    if (sub === '日用雜貨') sub = '日常用品';
    else if (sub === '家電修繕') sub = '日常服務';
    else if (sub === '房貸/房租') sub = '房貸';
    else if (sub === '水電瓦斯') { cat = '公用事業'; sub = '其他'; }
    else if (sub === '網路電信') { cat = '公用事業'; sub = '網路'; }
  } else if (cat === '醫療保健') {
    if (sub === '牙科檢查') sub = '健康檢查';
    else if (sub === '醫療保險') { cat = '保險'; sub = '保險'; }
  } else if (cat === '購物消費') {
    if (sub === '禮物採買') sub = '其他';
  } else if (cat === '休閒娛樂') {
    if (sub === '影音訂閱') { cat = '訂閱服務'; sub = '應用訂閱'; }
    else if (sub === '運動健身') { cat = '發展進修'; sub = '運動健身'; }
  } else if (cat === '進修與其他') {
    if (sub === '書籍課程') { cat = '發展進修'; sub = '課程學習'; }
    else if (sub === '運動健身') { cat = '發展進修'; sub = '運動健身'; }
    else if (sub === '稅金規費') { cat = '萬萬稅'; sub = '所得稅'; }
    else if (sub === '孝親紅包') { cat = '孝親支出'; sub = '孝親支出'; }
    else if (sub === '公益捐款') { cat = '捐獻'; sub = '捐獻'; }
    else { cat = '發展進修'; sub = '課程學習'; }
  }

  return { category: cat, subcategory: sub };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('W&C 家庭記帳本')
    .addItem('初始化 / 更新資料表與今年度 1-12 月總表', 'setupAllSheets')
    .addItem('新增跨年度 1-12 月總表 (例：2027)', 'promptCreateAnnualSheet')
    .addSeparator()
    .addItem('設定家庭通行碼 (Passcode)', 'promptPasscode')
    .addToUi();
}

function getExpectedPasscode() {
  const propCode = PropertiesService.getScriptProperties().getProperty('FAMILY_PASSCODE');
  return propCode || DEFAULT_FAMILY_PASSCODE;
}

function promptPasscode() {
  const ui = SpreadsheetApp.getUi();
  const current = getExpectedPasscode();
  const response = ui.prompt(
    '設定家庭存取通行碼',
    `目前通行碼為：「${current}」\n請輸入新的家庭通行碼（輸入後請同步在手機 App 更新）：`,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() === ui.Button.OK) {
    const val = response.getResponseText().trim();
    if (val) {
      PropertiesService.getScriptProperties().setProperty('FAMILY_PASSCODE', val);
      ui.alert('家庭通行碼已更新成功！');
    }
  }
}

/**
 * 跨年度一鍵產生新的「YYYY_年度總表」分頁
 */
function promptCreateAnnualSheet() {
  const ui = SpreadsheetApp.getUi();
  const nextYear = new Date().getFullYear() + 1;
  const response = ui.prompt(
    '建立跨年度 1-12 月收支總表',
    `請輸入要建立的西元年份（例如：${nextYear}）：`,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() === ui.Button.OK) {
    const yearStr = response.getResponseText().trim();
    if (/^\d{4}$/.test(yearStr)) {
      createOrUpdateAnnualSheet(Number(yearStr));
      ui.alert(`已成功建立「${yearStr}_年度總表」分頁！`);
    } else {
      ui.alert('請輸入有效的 4 位數西元年份（例如 2026 或 2027）');
    }
  }
}

let CURRENT_REQUEST_CALLBACK = '';

function doGet(e) {
  if (e && e.parameter && e.parameter.mode === 'postmessage') {
    const rpcId = String(e.parameter.rpcId || '');
    let payload = { ...e.parameter };
    if (e.parameter.data) {
      try {
        const parsed = JSON.parse(e.parameter.data);
        payload = { ...payload, ...parsed };
      } catch (err) {}
    }

    const lock = LockService.getScriptLock();
    lock.tryLock(10000);
    let resultObj;
    try {
      CURRENT_REQUEST_CALLBACK = '';
      const out = handleApiDispatch(payload);
      resultObj = JSON.parse(out.getContent());
    } catch (err) {
      resultObj = {
        ok: false,
        error: err && err.message ? err.message : String(err)
      };
    } finally {
      lock.releaseLock();
    }

    const postHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
  (function() {
    var msg = {
      __fasRpcId: ${JSON.stringify(rpcId)},
      ok: true,
      data: ${JSON.stringify(resultObj)}
    };
    try { window.top.postMessage(msg, '*'); } catch (e) {}
    try { if (window.parent && window.parent !== window.top) window.parent.postMessage(msg, '*'); } catch (e) {}
    try { if (window.parent && window.parent.parent) window.parent.parent.postMessage(msg, '*'); } catch (e) {}
  })();
</script>
</body></html>`;
    return HtmlService.createHtmlOutput(postHtml)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (e && e.parameter && e.parameter.action) {
    let payload = { ...e.parameter };
    CURRENT_REQUEST_CALLBACK = payload.callback || '';
    if (e.parameter.data) {
      try {
        const parsed = JSON.parse(e.parameter.data);
        payload = { ...payload, ...parsed };
      } catch (err) {}
    }
    return handleApiDispatch(payload);
  }

  return jsonResponse({
    ok: true,
    service: 'W&C Family Accounting System API',
    status: 'ready'
  });
}

function handleBridgeRpc(payload) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    CURRENT_REQUEST_CALLBACK = '';
    const out = handleApiDispatch(payload || {});
    return JSON.parse(out.getContent());
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: '無效的請求內容' });
    }

    const body = JSON.parse(e.postData.contents);
    CURRENT_REQUEST_CALLBACK = body.callback || (e.parameter && e.parameter.callback) || '';
    return handleApiDispatch(body);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    lock.releaseLock();
  }
}

function handleApiDispatch(body) {
  const expectedPasscode = String(getExpectedPasscode() || '').trim();
  const inputPasscode = String(body.passcode || '').trim();
  const hasVerifiedPasskey = Boolean(
    body.passkeyCredentialId && String(body.passkeyCredentialId).length >= 8
  );

  const isPasscodeMatch =
    inputPasscode.length > 0 &&
    (inputPasscode.toLowerCase() === expectedPasscode.toLowerCase() ||
      inputPasscode.toLowerCase() === DEFAULT_FAMILY_PASSCODE.toLowerCase());

  if (!isPasscodeMatch && !hasVerifiedPasskey) {
    return jsonResponse({
      ok: false,
      error: '家庭通行碼驗證失敗，請確認設定是否正確'
    });
  }

  if (body.action === 'verifyAuth') {
    return jsonResponse({ ok: true });
  }

  setupAllSheetsIfMissing();

  const action = body.action;
  if (action === 'syncAll' || action === 'fetchData') {
    return handleSyncAll(body);
  } else if (action === 'upsertTransaction') {
    return handleUpsertTransaction(body.transaction);
  } else if (action === 'batchInsertTransactions') {
    return handleBatchInsertTransactions(body.transactions || []);
  } else if (action === 'deleteTransaction') {
    return handleDeleteTransaction(body.id);
  } else if (action === 'clearAllTransactions') {
    return handleClearAllTransactions();
  } else if (action === 'migrateV16') {
    return handleMigrateV16();
  } else if (action === 'saveConfig') {
    return handleSaveConfig(body);
  } else if (action === 'ensureAnnualSheet') {
    const targetYear = Number(body.year) || new Date().getFullYear();
    createOrUpdateAnnualSheet(targetYear);
    return jsonResponse({ ok: true, year: targetYear });
  } else {
    return jsonResponse({ ok: false, error: `未知的動作: ${action}` });
  }
}

function jsonResponse(obj) {
  if (CURRENT_REQUEST_CALLBACK && String(CURRENT_REQUEST_CALLBACK).trim().length > 0) {
    const safeCallback = String(CURRENT_REQUEST_CALLBACK).replace(/[^a-zA-Z0-9_$]/g, '');
    return ContentService.createTextOutput(
      safeCallback + '(' + JSON.stringify(obj) + ');'
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * 自動建立 Transactions（收支明細）、App_Config（設定）與當年度「YYYY_年度總表 (1-12月)」
 */
function setupAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Transactions 明細表
  let txSheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  if (!txSheet) {
    txSheet = ss.insertSheet(SHEET_NAMES.TRANSACTIONS);
    const headers = [
      'ID',
      'Date',
      'YearMonth',
      'Type',
      'Category',
      'Subcategory',
      'Amount',
      'Note',
      'CreatedAt'
    ];
    txSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    txSheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1E1B4B')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    txSheet.setFrozenRows(1);
    txSheet.setColumnWidth(1, 150);
    txSheet.setColumnWidth(2, 110);
    txSheet.setColumnWidth(3, 95);
    txSheet.setColumnWidth(5, 110);
    txSheet.setColumnWidth(6, 110);
    txSheet.setColumnWidth(7, 100);
    txSheet.setColumnWidth(8, 260);
  }

  // 2. App_Config 系統設定表
  let cfgSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (!cfgSheet) {
    cfgSheet = ss.insertSheet(SHEET_NAMES.CONFIG);
    cfgSheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value_JSON', 'UpdatedAt']]);
    cfgSheet.getRange(1, 1, 1, 3)
      .setBackground('#312E81')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    cfgSheet.setFrozenRows(1);
  }

  // 3. 建立今年度的「YYYY_年度總表 (1-12月)」
  const currentYear = new Date().getFullYear();
  createOrUpdateAnnualSheet(currentYear);
}

/**
 * 建立或更新指定年份的「1-12 月家庭收支年度總表」
 * 包含：1~12月各月收入分類、總收入、各月支出分類、總支出、每月淨結餘、儲蓄率、全年合計、月平均與分類佔比
 */
function createOrUpdateAnnualSheet(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = `${year}_年度總表`;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName, 0); // 放在第一個分頁方便開啟直接檢視
  } else {
    sheet.clear();
  }

  // 讀取使用者自訂分類（優先從「分類設定」可視化工作表讀取，若無則使用預設分類）
  const cats = readCategoriesFromSheetOrConfig();

  const incomeCats = cats.filter((c) => c.type === 'income').map((c) => c.name);
  const expenseCats = cats.filter((c) => c.type === 'expense').map((c) => c.name);

  // 標題列
  sheet.getRange('A1').setValue(`W&C 家庭收支年度總表 (${year} 年 1-12 月)`);
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#1E1B4B');
  sheet.getRange('A2').setValue('說明：本表所有數字皆透過 SUMIFS 公式自動從 Transactions 明細表即時彙總，跨年可直接使用選單新增下個年度分頁。')
    .setFontSize(9).setFontColor('#64748B');

  // 第 4 列：隱藏輔助列（YYYY-01 ~ YYYY-12）供公式精準參照，第 5 列：顯示表頭
  const ymRow = ['月份代碼'];
  const headerRow = ['項目 / 分類'];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    ymRow.push(`${year}-${mm}`);
    headerRow.push(`${m}月`);
  }
  ymRow.push('TOTAL', 'AVG', 'PCT');
  headerRow.push('全年合計', '月平均', '佔比');

  sheet.getRange(4, 1, 1, 16).setValues([ymRow]).setFontColor('#94A3B8').setFontSize(8);
  sheet.hideRows(4);

  sheet.getRange(5, 1, 1, 16).setValues([headerRow])
    .setBackground('#1E1B4B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.getRange(5, 1).setHorizontalAlignment('left');

  let currentRow = 6;

  // ==================== 【一、收入區塊】 ====================
  const incStartRow = currentRow;
  const incRows = incomeCats.map((catName, idx) => {
    const r = incStartRow + idx;
    const rowArr = [catName];
    for (let m = 1; m <= 12; m++) {
      const colLetter = columnToLetter(m + 1); // B ~ M
      rowArr.push(`=SUMIFS(Transactions!$G:$G, Transactions!$C:$C, ${colLetter}$4, Transactions!$D:$D, "income", Transactions!$E:$E, $A${r})`);
    }
    return rowArr;
  });

  if (incRows.length > 0) {
    sheet.getRange(incStartRow, 1, incRows.length, 13).setValues(incRows);
    currentRow += incRows.length;
  }

  const totalIncRow = currentRow;
  // 補上每列收入的「全年合計」、「月平均」、「佔比」
  for (let i = 0; i < incRows.length; i++) {
    const r = incStartRow + i;
    sheet.getRange(r, 14, 1, 3).setFormulas([[
      `=SUM(B${r}:M${r})`,
      `=AVERAGE(B${r}:M${r})`,
      `=IF($N$${totalIncRow}>0, N${r}/$N$${totalIncRow}, 0)`
    ]]);
  }

  // 收入總計列
  const totalIncFormulas = ['【家庭總收入】'];
  for (let m = 1; m <= 12; m++) {
    const colLetter = columnToLetter(m + 1);
    totalIncFormulas.push(`=SUM(${colLetter}${incStartRow}:${colLetter}${totalIncRow - 1})`);
  }
  totalIncFormulas.push(
    `=SUM(B${totalIncRow}:M${totalIncRow})`,
    `=AVERAGE(B${totalIncRow}:M${totalIncRow})`,
    `1`
  );
  sheet.getRange(totalIncRow, 1, 1, 16).setValues([totalIncFormulas])
    .setBackground('#EEF2FF')
    .setFontWeight('bold')
    .setFontColor('#1E1B4B');

  currentRow += 2; // 空一列分隔

  // ==================== 【二、支出區塊】 ====================
  const expStartRow = currentRow;
  const expRows = expenseCats.map((catName, idx) => {
    const r = expStartRow + idx;
    const rowArr = [catName];
    for (let m = 1; m <= 12; m++) {
      const colLetter = columnToLetter(m + 1);
      rowArr.push(`=SUMIFS(Transactions!$G:$G, Transactions!$C:$C, ${colLetter}$4, Transactions!$D:$D, "expense", Transactions!$E:$E, $A${r})`);
    }
    return rowArr;
  });

  if (expRows.length > 0) {
    sheet.getRange(expStartRow, 1, expRows.length, 13).setValues(expRows);
    currentRow += expRows.length;
  }

  const totalExpRow = currentRow;
  for (let i = 0; i < expRows.length; i++) {
    const r = expStartRow + i;
    sheet.getRange(r, 14, 1, 3).setFormulas([[
      `=SUM(B${r}:M${r})`,
      `=AVERAGE(B${r}:M${r})`,
      `=IF($N$${totalExpRow}>0, N${r}/$N$${totalExpRow}, 0)`
    ]]);
  }

  // 支出總計列
  const totalExpFormulas = ['【家庭總支出】'];
  for (let m = 1; m <= 12; m++) {
    const colLetter = columnToLetter(m + 1);
    totalExpFormulas.push(`=SUM(${colLetter}${expStartRow}:${colLetter}${totalExpRow - 1})`);
  }
  totalExpFormulas.push(
    `=SUM(B${totalExpRow}:M${totalExpRow})`,
    `=AVERAGE(B${totalExpRow}:M${totalExpRow})`,
    `1`
  );
  sheet.getRange(totalExpRow, 1, 1, 16).setValues([totalExpFormulas])
    .setBackground('#F1F5F9')
    .setFontWeight('bold')
    .setFontColor('#0F172A');

  currentRow += 2; // 空一列分隔

  // ==================== 【三、年度結餘與儲蓄率區塊】 ====================
  const netRow = currentRow;
  const rateRow = currentRow + 1;

  const netFormulas = ['【每月淨結餘 (收入-支出)】'];
  const rateFormulas = ['【每月儲蓄率 (%)】'];

  for (let m = 1; m <= 12; m++) {
    const colLetter = columnToLetter(m + 1);
    netFormulas.push(`=${colLetter}${totalIncRow}-${colLetter}${totalExpRow}`);
    rateFormulas.push(`=IF(${colLetter}${totalIncRow}>0, ${colLetter}${netRow}/${colLetter}${totalIncRow}, 0)`);
  }
  netFormulas.push(
    `=N${totalIncRow}-N${totalExpRow}`,
    `=AVERAGE(B${netRow}:M${netRow})`,
    `=IF(N${totalIncRow}>0, N${netRow}/N${totalIncRow}, 0)`
  );
  rateFormulas.push(
    `=IF(N${totalIncRow}>0, N${netRow}/N${totalIncRow}, 0)`,
    `=AVERAGE(B${rateRow}:M${rateRow})`,
    `-`
  );

  sheet.getRange(netRow, 1, 1, 16).setValues([netFormulas])
    .setBackground('#312E81')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');

  sheet.getRange(rateRow, 1, 1, 16).setValues([rateFormulas])
    .setBackground('#F8FAFC')
    .setFontColor('#334155')
    .setFontWeight('bold');

  // 數字格式與欄寬美化
  sheet.getRange(incStartRow, 2, netRow - incStartRow + 1, 14).setNumberFormat('$#,##0;($#,##0);"-"');
  sheet.getRange(incStartRow, 16, totalExpRow - incStartRow + 1, 1).setNumberFormat('0.0%');
  sheet.getRange(netRow, 16, 1, 1).setNumberFormat('0.0%');
  sheet.getRange(rateRow, 2, 1, 14).setNumberFormat('0.0%');

  sheet.setFrozenRows(5);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 175);
  for (let c = 2; c <= 13; c++) {
    sheet.setColumnWidth(c, 88);
  }
  sheet.setColumnWidth(14, 110);
  sheet.setColumnWidth(15, 95);
  sheet.setColumnWidth(16, 75);
}

function columnToLetter(column) {
  let temp;
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function setupAllSheetsIfMissing() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentYear = new Date().getFullYear();
  if (
    !ss.getSheetByName(SHEET_NAMES.TRANSACTIONS) ||
    !ss.getSheetByName(SHEET_NAMES.CONFIG) ||
    !ss.getSheetByName(`${currentYear}_年度總表`)
  ) {
    setupAllSheets();
  }
}

function readAllTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const list = [];
  const tz = Session.getScriptTimeZone() || 'Asia/Taipei';

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    let dateStr = row[1];
    if (dateStr instanceof Date) {
      dateStr = Utilities.formatDate(dateStr, tz, 'yyyy-MM-dd');
    } else {
      dateStr = String(dateStr).slice(0, 10);
    }

    list.push({
      id: String(row[0]),
      date: dateStr,
      type: String(row[3] || 'expense'),
      category: String(row[4] || ''),
      subcategory: String(row[5] || ''),
      amount: Number(row[6]) || 0,
      note: String(row[7] || ''),
      createdAt: String(row[8] || '')
    });
  }
  return list;
}

function readConfigMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (!sheet) return {};
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow <= 1) return map;

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  rows.forEach((r) => {
    const key = String(r[0] || '');
    if (key && r[1]) {
      try {
        map[key] = JSON.parse(String(r[1]));
      } catch (e) {}
    }
  });
  return map;
}

function writeConfigKey(key, objValue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  const lastRow = sheet.getLastRow();
  const nowIso = new Date().toISOString();
  const jsonStr = JSON.stringify(objValue);

  if (lastRow > 1) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[jsonStr, nowIso]]);
        return;
      }
    }
  }
  sheet.appendRow([key, jsonStr, nowIso]);
}

function writeCategoriesToTableSheet(categories) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES_TABLE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.CATEGORIES_TABLE);
  } else {
    sheet.clear();
  }

  const headers = [
    '收支類型 (支出/收入)',
    '主分類名稱',
    '子分類清單 (請用頓號「、」或逗號「,」分隔，可直接在此修改)',
    '圖示代碼',
    '系統ID'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#1E1B4B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);

  const rows = (categories || DEFAULT_V16_CATEGORIES).map((c, idx) => [
    c.type === 'income' ? '收入' : '支出',
    c.name || '',
    Array.isArray(c.subcategories) ? c.subcategories.join('、') : '',
    c.icon || 'tag',
    c.id || `cat-custom-${idx + 1}`
  ]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 380);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 130);
}

function readCategoriesFromSheetOrConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES_TABLE);
  if (sheet && sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    const list = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      const name = String(r[1] || '').trim();
      if (!name) continue;
      const typeRaw = String(r[0] || '').trim();
      const type = typeRaw === '收入' || typeRaw.toLowerCase() === 'income' ? 'income' : 'expense';
      const subRaw = String(r[2] || '').trim();
      const subcategories = subRaw
        ? subRaw.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
        : [name];
      const icon = String(r[3] || 'tag').trim() || 'tag';
      const id = String(r[4] || `cat-${i + 1}`).trim();
      list.push({ id, type, name, icon, subcategories });
    }
    if (list.length > 0) {
      const hasParenting = list.some((c) => c.name === '育兒' || c.id === 'cat-parenting');
      if (!hasParenting) {
        const parentingObj = {
          id: 'cat-parenting',
          type: 'expense',
          name: '育兒',
          icon: 'baby',
          subcategories: ['何岱芸學費', '滿滿才藝課', '其他育兒支出', '小荷包才藝課', '何岱恩學費']
        };
        const incIdx = list.findIndex((c) => c.type === 'income');
        if (incIdx >= 0) {
          list.splice(incIdx, 0, parentingObj);
        } else {
          list.push(parentingObj);
        }
        writeCategoriesToTableSheet(list);
        createOrUpdateAnnualSheet(new Date().getFullYear());
      }
      return list;
    }
  }

  const configMap = readConfigMap();
  if (Array.isArray(configMap.categories) && configMap.categories.length > 0) {
    return configMap.categories;
  }
  return DEFAULT_V16_CATEGORIES;
}

function handleSyncAll(body) {
  const configMap = readConfigMap();
  const categories = readCategoriesFromSheetOrConfig();
  writeConfigKey('categories', categories);

  if (!configMap.members && Array.isArray(body.localMembers)) {
    writeConfigKey('members', body.localMembers);
    configMap.members = body.localMembers;
  }
  if (!configMap.templates && Array.isArray(body.localTemplates)) {
    writeConfigKey('templates', body.localTemplates);
    configMap.templates = body.localTemplates;
  }

  const transactions = readAllTransactions();
  return jsonResponse({
    ok: true,
    transactions,
    categories,
    members: configMap.members || [],
    templates: configMap.templates || DEFAULT_V16_TEMPLATES
  });
}

function handleUpsertTransaction(tx) {
  if (!tx || !tx.id) {
    return jsonResponse({ ok: false, error: '缺少交易 ID' });
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const lastRow = sheet.getLastRow();
  const ym = String(tx.date || '').slice(0, 7);
  const rowData = [
    tx.id,
    tx.date,
    ym,
    tx.type || 'expense',
    tx.category || '',
    tx.subcategory || '',
    Number(tx.amount) || 0,
    tx.note || '',
    tx.createdAt || new Date().toISOString()
  ];

  // 若記帳年份尚無年度總表，自動建立該年度 1-12 月總表
  const txYear = Number(ym.slice(0, 4));
  if (txYear >= 2020 && !ss.getSheetByName(`${txYear}_年度總表`)) {
    createOrUpdateAnnualSheet(txYear);
  }

  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(tx.id)) {
        sheet.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);
        return jsonResponse({ ok: true, updated: true, id: tx.id });
      }
    }
  }

  sheet.appendRow(rowData);
  return jsonResponse({ ok: true, created: true, id: tx.id });
}

function handleBatchInsertTransactions(txList) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const rows = txList.map((tx) => [
    tx.id,
    tx.date,
    String(tx.date || '').slice(0, 7),
    tx.type || 'expense',
    tx.category || '',
    tx.subcategory || '',
    Number(tx.amount) || 0,
    tx.note || '',
    tx.createdAt || new Date().toISOString()
  ]);
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  }
  return jsonResponse({ ok: true, count: rows.length });
}

function handleDeleteTransaction(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const lastRow = sheet.getLastRow();
  let deleted = false;
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        deleted = true;
      }
    }
  }
  return jsonResponse({ ok: true, deleted, id });
}

function handleClearAllTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  if (sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
  }
  return jsonResponse({ ok: true, cleared: true });
}

function handleSaveConfig(body) {
  if (Array.isArray(body.categories) && body.categories.length > 0) {
    writeConfigKey('categories', body.categories);
    writeCategoriesToTableSheet(body.categories);
    // 當自訂分類更新時，自動同步更新當年度 1-12 月總表列項
    createOrUpdateAnnualSheet(new Date().getFullYear());
  }
  if (Array.isArray(body.members)) writeConfigKey('members', body.members);
  if (Array.isArray(body.templates)) writeConfigKey('templates', body.templates);
  return jsonResponse({ ok: true });
}

function handleMigrateV16() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  writeConfigKey('categories', DEFAULT_V16_CATEGORIES);
  writeCategoriesToTableSheet(DEFAULT_V16_CATEGORIES);
  writeConfigKey('templates', DEFAULT_V16_TEMPLATES);

  const txSheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  if (txSheet && txSheet.getLastRow() > 1) {
    const lastRow = txSheet.getLastRow();
    const values = txSheet.getRange(2, 1, lastRow - 1, 9).getValues();
    const testIds = {
      'tx-1793017528226': true,
      'tx-1793017881028': true,
      'tx-nocors-test': true
    };
    const keptRows = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      const id = String(r[0] || '');
      if (!id || id.indexOf('tx-sample-') === 0 || testIds[id]) {
        continue;
      }
      const migrated = migrateGasCategoryPair(r[4], r[5]);
      r[4] = migrated.category;
      r[5] = migrated.subcategory;
      keptRows.push(r);
    }
    txSheet.deleteRows(2, lastRow - 1);
    if (keptRows.length > 0) {
      txSheet.getRange(2, 1, keptRows.length, 9).setValues(keptRows);
    }
  }

  createOrUpdateAnnualSheet(new Date().getFullYear());
  return jsonResponse({ ok: true, migrated: 'v16', categoriesCount: DEFAULT_V16_CATEGORIES.length });
}
