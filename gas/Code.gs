/**
 * ============================================================================
 * W&C 家庭記帳本 - Google Apps Script (GAS) 雲端同步與年度總表後端
 * ============================================================================
 */

const DEFAULT_FAMILY_PASSCODE = 'WC-Family-2026';

const SHEET_NAMES = {
  TRANSACTIONS: 'Transactions',
  CONFIG: 'App_Config'
};

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

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'W&C Family Accounting System API',
    status: 'ready'
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: '無效的請求內容' });
    }

    const body = JSON.parse(e.postData.contents);
    const expectedPasscode = getExpectedPasscode();

    if (expectedPasscode && body.passcode !== expectedPasscode) {
      return jsonResponse({
        ok: false,
        error: '家庭通行碼驗證失敗，請確認設定是否正確'
      });
    }

    setupAllSheetsIfMissing();

    const action = body.action;
    if (action === 'syncAll') {
      return handleSyncAll(body);
    } else if (action === 'upsertTransaction') {
      return handleUpsertTransaction(body.transaction);
    } else if (action === 'batchInsertTransactions') {
      return handleBatchInsertTransactions(body.transactions || []);
    } else if (action === 'deleteTransaction') {
      return handleDeleteTransaction(body.id);
    } else if (action === 'saveConfig') {
      return handleSaveConfig(body);
    } else if (action === 'ensureAnnualSheet') {
      const targetYear = Number(body.year) || new Date().getFullYear();
      createOrUpdateAnnualSheet(targetYear);
      return jsonResponse({ ok: true, year: targetYear });
    } else {
      return jsonResponse({ ok: false, error: `未知的動作: ${action}` });
    }
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
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

  // 讀取使用者自訂分類（若尚無則使用預設分類）
  const configMap = readConfigMap();
  const cats = Array.isArray(configMap.categories) && configMap.categories.length > 0
    ? configMap.categories
    : [
        { type: 'income', name: '薪資獎金' },
        { type: 'income', name: '投資理財' },
        { type: 'income', name: '其他收入' },
        { type: 'expense', name: '餐飲食品' },
        { type: 'expense', name: '居家生活' },
        { type: 'expense', name: '交通出行' },
        { type: 'expense', name: '購物消費' },
        { type: 'expense', name: '休閒娛樂' },
        { type: 'expense', name: '醫療保健' },
        { type: 'expense', name: '進修與其他' }
      ];

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

function handleSyncAll(body) {
  const configMap = readConfigMap();

  if (!configMap.categories && Array.isArray(body.localCategories)) {
    writeConfigKey('categories', body.localCategories);
    configMap.categories = body.localCategories;
  }
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
    categories: configMap.categories || [],
    members: configMap.members || [],
    templates: configMap.templates || []
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
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        return jsonResponse({ ok: true, deleted: true, id });
      }
    }
  }
  return jsonResponse({ ok: true, deleted: false, id });
}

function handleSaveConfig(body) {
  if (Array.isArray(body.categories)) {
    writeConfigKey('categories', body.categories);
    // 當自訂分類更新時，自動同步更新當年度 1-12 月總表列項
    createOrUpdateAnnualSheet(new Date().getFullYear());
  }
  if (Array.isArray(body.members)) writeConfigKey('members', body.members);
  if (Array.isArray(body.templates)) writeConfigKey('templates', body.templates);
  return jsonResponse({ ok: true });
}
