/**
 * ============================================================================
 * W&C 家庭記帳本 - Google Apps Script (GAS) 雲端同步後端
 * ============================================================================
 * 【安裝與部署步驟（只需 2 分鐘）】
 * 1. 打開你的 Google Sheet「家庭總帳本」（或新建一份 Google 試算表）
 * 2. 點擊上方選單「擴充功能 (Extensions)」>「Apps Script」
 * 3. 將本檔案所有內容貼上取代原本的程式碼，並修改下方 FAMILY_PASSCODE 為你們夫妻專屬的通行碼
 * 4. 點擊右上角「部署 (Deploy)」>「新增部署作業 (New deployment)」
 *    - 選取類型：「網頁應用程式 (Web app)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」（放心！所有請求都會經過下方 FAMILY_PASSCODE 嚴格驗證）
 * 5. 複製產生的「網頁應用程式網址 (https://script.google.com/macros/s/.../exec)」
 *    貼到手機 App 的「雲端同步設定」即可！
 * ============================================================================
 */

// 🔐 請修改為你與 Christine 專屬的家庭通行碼（建議 8 碼以上英數組合）
const DEFAULT_FAMILY_PASSCODE = 'WC-Family-2026';

const SHEET_NAMES = {
  TRANSACTIONS: 'Transactions',
  MONTHLY_SUMMARY: 'Monthly_Summary',
  CONFIG: 'App_Config'
};

/**
 * 在 Google Sheet 上方新增專屬選單，方便一鍵初始化或更新月度總帳本報表
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏡 W&C 家庭記帳本')
    .addItem('✨ 初始化 / 修復資料表與月度總帳本', 'setupAllSheets')
    .addItem('🔐 設定家庭通行碼 (Passcode)', 'promptPasscode')
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
    '🔐 設定家庭存取通行碼',
    `目前通行碼為：「${current}」\n請輸入新的家庭通行碼（輸入後請同步在手機 App 更新）：`,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() === ui.Button.OK) {
    const val = response.getResponseText().trim();
    if (val) {
      PropertiesService.getScriptProperties().setProperty('FAMILY_PASSCODE', val);
      ui.alert('✅ 家庭通行碼已更新成功！');
    }
  }
}

function doGet(e) {
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
        error: '家庭通行碼 (Passcode) 驗證失敗，請確認設定是否正確'
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
 * 自動建立 Transactions（收支明細）、Monthly_Summary（家庭總帳本月度彙總）、App_Config（設定）
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
      'Member',
      'Note',
      'CreatedAt'
    ];
    txSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    txSheet.getRange(1, 1, 1, headers.length)
      .setBackground('#4F46E5')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    txSheet.setFrozenRows(1);
    txSheet.setColumnWidth(1, 150);
    txSheet.setColumnWidth(2, 110);
    txSheet.setColumnWidth(3, 95);
    txSheet.setColumnWidth(5, 110);
    txSheet.setColumnWidth(6, 110);
    txSheet.setColumnWidth(7, 100);
    txSheet.setColumnWidth(8, 100);
    txSheet.setColumnWidth(9, 240);
  }

  // 2. App_Config 系統設定表（儲存自訂分類、子分類、成員、常用模板 JSON）
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

  // 3. Monthly_Summary 家庭總帳本月度自動彙總表
  let sumSheet = ss.getSheetByName(SHEET_NAMES.MONTHLY_SUMMARY);
  if (!sumSheet) {
    sumSheet = ss.insertSheet(SHEET_NAMES.MONTHLY_SUMMARY);
    const now = new Date();
    const ym = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy-MM');

    sumSheet.getRange('A1').setValue('🏡 W&C 家庭總帳本 - 月度自動彙總表');
    sumSheet.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#4F46E5');
    sumSheet.getRange('A2').setValue('查詢月份 (YYYY-MM)：');
    sumSheet.getRange('B2').setValue(ym).setBackground('#FEF3C7').setFontWeight('bold');

    sumSheet.getRange('A4:C4').setValues([['收支指標 / 成員', '當月金額', '公式說明']])
      .setBackground('#4F46E5').setFontColor('#FFFFFF').setFontWeight('bold');

    sumSheet.getRange('A5:C9').setValues([
      ['當月總收入', `=SUMIFS(Transactions!G:G, Transactions!C:C, $B$2, Transactions!D:D, "income")`, '自動統計當月所有收入'],
      ['當月總支出', `=SUMIFS(Transactions!G:G, Transactions!C:C, $B$2, Transactions!D:D, "expense")`, '自動統計當月所有支出'],
      ['當月淨結餘', `=B5-B6`, '總收入 - 總支出'],
      ['Willie 支付總額', `=SUMIFS(Transactions!G:G, Transactions!C:C, $B$2, Transactions!D:D, "expense", Transactions!H:H, "Willie")`, 'Willie 經手之支出'],
      ['Christine 支付總額', `=SUMIFS(Transactions!G:G, Transactions!C:C, $B$2, Transactions!D:D, "expense", Transactions!H:H, "Christine")`, 'Christine 經手之支出']
    ]);

    sumSheet.getRange('A11:C11').setValues([['支出主分類', '當月支出金額', '佔總支出比例']])
      .setBackground('#312E81').setFontColor('#FFFFFF').setFontWeight('bold');

    const defaultExpCats = ['餐飲食品', '居家生活', '交通出行', '購物消費', '休閒娛樂', '醫療保健', '進修與其他'];
    const catRows = defaultExpCats.map((cat, idx) => {
      const rowNum = 12 + idx;
      return [
        cat,
        `=SUMIFS(Transactions!G:G, Transactions!C:C, $B$2, Transactions!D:D, "expense", Transactions!E:E, A${rowNum})`,
        `=IF($B$6>0, B${rowNum}/$B$6, 0)`
      ];
    });
    sumSheet.getRange(12, 1, catRows.length, 3).setValues(catRows);
    sumSheet.getRange(12, 3, catRows.length, 1).setNumberFormat('0.0%');
    sumSheet.getRange('B5:B18').setNumberFormat('$#,##0');
    sumSheet.setColumnWidth(1, 160);
    sumSheet.setColumnWidth(2, 140);
    sumSheet.setColumnWidth(3, 220);
  }
}

function setupAllSheetsIfMissing() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (
    !ss.getSheetByName(SHEET_NAMES.TRANSACTIONS) ||
    !ss.getSheetByName(SHEET_NAMES.CONFIG)
  ) {
    setupAllSheets();
  }
}

function readAllTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
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
      member: String(row[7] || 'Willie'),
      note: String(row[8] || ''),
      createdAt: String(row[9] || '')
    });
  }
  return list;
}

function readConfigMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
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
    tx.member || 'Willie',
    tx.note || '',
    tx.createdAt || new Date().toISOString()
  ];

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
    tx.member || 'Willie',
    tx.note || '',
    tx.createdAt || new Date().toISOString()
  ]);
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
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
  if (Array.isArray(body.categories)) writeConfigKey('categories', body.categories);
  if (Array.isArray(body.members)) writeConfigKey('members', body.members);
  if (Array.isArray(body.templates)) writeConfigKey('templates', body.templates);
  return jsonResponse({ ok: true });
}
