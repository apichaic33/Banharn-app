// ============================================================
//  บัญชีครัวเรือน & เกษตร — Google Apps Script Backend v1.2
//  GAS = Primary Database (Sheet is Master)
//  Device = Cache ชั่วคราว
// ============================================================

// ★ ใส่ Spreadsheet ID ของคุณที่นี่
var SPREADSHEET_ID = '1NzyjkLguDY0B4sO4ukN49CpPU5rVrcD6xiY6D_MRYxM';

var SHEETS = {
  home_transactions : 'รายการครัวเรือน',
  farm_transactions : 'รายการเกษตร',
  home_budgets      : 'งบประมาณครัวเรือน',
  farm_budgets      : 'งบประมาณเกษตร',
  home_debts        : 'สินเชื่อครัวเรือน',
  farm_debts        : 'สินเชื่อเกษตร',
  meta              : 'Meta'
};

var HEADERS = {
  transactions : ['id','type','amount','desc','category','date','note','qty','unit','unitPrice','updatedAt'],
  budgets      : ['id','category','amount','month','updatedAt'],
  debts        : ['id','name','institution','debtType','total','originalTotal',
                  'interestRate','interestType','installment','paidCount','extraPaid',
                  'nextDue','note','updatedAt']
};

// ============================================================
//  ENTRY POINTS
// ============================================================

function doGet(e) {
  return _respond(handleRequest(e));
}

function doPost(e) {
  return _respond(handleRequest(e));
}

function _respond(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e) {
  try {
    var params = {};
    if (e && e.parameter) {
      for (var k in e.parameter) params[k] = e.parameter[k];
    }
    var action = params.action || '';

    if (e && e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        for (var k2 in body) params[k2] = body[k2];
        if (!action && body.action) action = body.action;
      } catch(ex) {}
    }

    switch (action) {
      case 'ping':   return { status:'ok', message:'เชื่อมต่อสำเร็จ', ts: new Date().toISOString() };
      case 'pull':   return pullData();
      case 'push':   return pushData(params);
      case 'sync':   return syncData(params);
      case 'setup':  return setupSheets();
      default:       return { status:'error', message:'Unknown action: "' + action + '"' };
    }
  } catch (err) {
    return { status:'error', message: err.toString() };
  }
}

// ============================================================
//  SETUP — รัน 1 ครั้งก่อน Deploy
//  เลือก setupSheets → ▶ Run
// ============================================================

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var created = [], skipped = [];

  var defs = [
    { key:'home_transactions', h:HEADERS.transactions },
    { key:'farm_transactions', h:HEADERS.transactions },
    { key:'home_budgets',      h:HEADERS.budgets },
    { key:'farm_budgets',      h:HEADERS.budgets },
    { key:'home_debts',        h:HEADERS.debts },
    { key:'farm_debts',        h:HEADERS.debts },
    { key:'meta',              h:['key','value','updatedAt'] }
  ];

  defs.forEach(function(def) {
    var name = SHEETS[def.key];
    var sheet = ss.getSheetByName(name);
    if (!sheet) { sheet = ss.insertSheet(name); created.push(name); }
    else { skipped.push(name); }

    // เขียน header ใหม่เสมอ (safe reset)
    sheet.clearContents();
    var hr = sheet.getRange(1, 1, 1, def.h.length);
    hr.setValues([def.h]);
    hr.setBackground('#5C3310');
    hr.setFontColor('#FFFFFF');
    hr.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    for (var c = 2; c <= def.h.length; c++) sheet.setColumnWidth(c, 120);
  });

  // ลบ Sheet1 ที่ Google สร้างให้อัตโนมัติ
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  // เขียน Meta
  var meta = ss.getSheetByName(SHEETS.meta);
  _setMeta(meta, 'setup_date', new Date().toISOString());
  _setMeta(meta, 'version', '1.2');

  Logger.log('Setup: created=[' + created + '] skipped=[' + skipped + ']');
  return { status:'ok', message:'Setup เสร็จ ✓', created:created, skipped:skipped };
}

// ============================================================
//  PULL — ส่งข้อมูลทั้งหมดจาก GAS ไปยังแอพ
//  เรียกตอนเปิดแอพ (GAS = master)
// ============================================================

function pullData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    status : 'ok',
    ts     : new Date().toISOString(),
    home   : {
      transactions : _readRows(ss, SHEETS.home_transactions),
      budgets      : _readRows(ss, SHEETS.home_budgets),
      debts        : _readRows(ss, SHEETS.home_debts)
    },
    farm   : {
      transactions : _readRows(ss, SHEETS.farm_transactions),
      budgets      : _readRows(ss, SHEETS.farm_budgets),
      debts        : _readRows(ss, SHEETS.farm_debts)
    }
  };
}

// ============================================================
//  PUSH — รับจากแอพ เขียนลง Sheet ทับเลย (แอพส่งมาเชื่อถือได้)
// ============================================================

function pushData(params) {
  var data = _parse(params.data);
  if (!data) return { status:'error', message:'ไม่มี data' };
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var ts = new Date().toISOString();
  _writeAll(ss, data, ts);
  _setMeta(ss.getSheetByName(SHEETS.meta), 'last_push', ts);
  return { status:'ok', ts:ts };
}

// ============================================================
//  SYNC — merge Sheet + local แล้วเขียนกลับ + ตอบ merged
//  หลักการ: id เดียวกัน → local wins (ข้อมูลใหม่กว่า)
//            id ไม่มีใน local → เก็บข้อมูลจาก Sheet (Device อื่น)
// ============================================================

function syncData(params) {
  var local = _parse(params.data);
  if (!local) return pullData();

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var ts = new Date().toISOString();

  var merged = { status:'ok', ts:ts, home:{}, farm:{} };

  ['home','farm'].forEach(function(acc) {
    var L = local[acc] || { transactions:[], budgets:[], debts:[] };
    merged[acc] = {
      transactions : _mergeById(_readRows(ss, SHEETS[acc+'_transactions']), L.transactions||[]),
      budgets      : _mergeById(_readRows(ss, SHEETS[acc+'_budgets']),      L.budgets||[]),
      debts        : _mergeById(_readRows(ss, SHEETS[acc+'_debts']),        L.debts||[])
    };
  });

  _writeAll(ss, merged, ts);
  _setMeta(ss.getSheetByName(SHEETS.meta), 'last_sync', ts);
  return merged;
}

// ============================================================
//  HELPERS
// ============================================================

function _parse(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(e) { return null; } }
  return raw;
}

function _writeAll(ss, data, ts) {
  ['home','farm'].forEach(function(acc) {
    if (!data[acc]) return;
    _writeRows(ss, SHEETS[acc+'_transactions'], HEADERS.transactions, data[acc].transactions||[], ts);
    _writeRows(ss, SHEETS[acc+'_budgets'],      HEADERS.budgets,      data[acc].budgets||[],      ts);
    _writeRows(ss, SHEETS[acc+'_debts'],        HEADERS.debts,        data[acc].debts||[],        ts);
  });
}

function _writeRows(ss, sheetName, headers, rows, ts) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) { Logger.log('Sheet ไม่พบ: ' + sheetName); return; }

  var last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
  if (!rows || rows.length === 0) return;

  var data2d = rows.map(function(row) {
    return headers.map(function(h) {
      if (h === 'updatedAt') return ts;
      var v = row[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'boolean') return String(v);
      if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      return v;
    });
  });

  sheet.getRange(2, 1, data2d.length, headers.length).setValues(data2d);

  // สีแถวสลับ (batch)
  var n = data2d.length, c = headers.length;
  sheet.getRange(2, 1, n, c).setBackground('#FFFFFF');
  for (var i = 0; i < n; i += 2) {
    sheet.getRange(i + 2, 1, 1, c).setBackground('#FDF8F2');
  }
}

function _readRows(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var all = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = all[0];
  var numFields = ['amount','qty','unitPrice','total','originalTotal',
                   'installment','interestRate','paidCount','extraPaid'];
  var result = [];

  for (var r = 1; r < all.length; r++) {
    var row = all[r];
    if (!row[0] || row[0] === '') continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (h === 'updatedAt') continue;
      var v = row[c];
      if (numFields.indexOf(h) >= 0) {
        v = (v === '' || v === null || v === undefined) ? null : (parseFloat(v) || 0);
      }
      if (v instanceof Date) {
        v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[h] = v;
    }
    result.push(obj);
  }
  return result;
}

// Merge: Sheet ให้ข้อมูลจาก Device อื่น, local wins สำหรับ id เดียวกัน
function _mergeById(sheetRows, localRows) {
  var map = {};
  sheetRows.forEach(function(r) { if (r && r.id) map[String(r.id)] = r; });
  localRows.forEach(function(r) { if (r && r.id) map[String(r.id)] = r; }); // local override
  return Object.keys(map).map(function(k) { return map[k]; });
}

function _setMeta(sheet, key, value) {
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last === 0) { sheet.appendRow(['key','value','updatedAt']); last = 1; }
  if (last >= 2) {
    var col = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (col[i][0] === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        sheet.getRange(i + 2, 3).setValue(new Date().toISOString());
        return;
      }
    }
  }
  sheet.appendRow([key, value, new Date().toISOString()]);
}

// ============================================================
//  TEST — รันเพื่อตรวจ ID + Sheet
//  เลือก testSetup → ▶ Run → ดู View > Logs
// ============================================================

function testSetup() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ Spreadsheet: ' + ss.getName());
    var names = ss.getSheets().map(function(s){ return s.getName(); });
    Logger.log('📋 Sheets: ' + names.join(' | '));
    var needed = Object.keys(SHEETS).map(function(k){ return SHEETS[k]; });
    var missing = needed.filter(function(n){ return names.indexOf(n) < 0; });
    if (missing.length) Logger.log('⚠️  ขาด: ' + missing.join(', ') + ' → รัน setupSheets()');
    else Logger.log('✅ พร้อม Deploy!');
  } catch(e) {
    Logger.log('❌ ' + e + ' → ตรวจ SPREADSHEET_ID');
  }
}
