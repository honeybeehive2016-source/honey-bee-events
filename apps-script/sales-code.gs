/**
 * HONEY BEE 売上管理 v1 用 JSON endpoint
 * Google Apps Script Web App 用
 * 例:
 *   /exec?targetMonth=2026-03
 *   /exec?targetMonth=2026-05&sheetName=2026年5月
 */

var SPREADSHEET_ID = "153o_JIWPNZnQ4lAt9HpgRWwfa9JOrJLXC-318XiKvlQ";

var BLOCKS = [
  {
    name: "firstHalf",
    dayStart: 1,
    dayEnd: 15,
    headerRow: 4,
    weekdayRow: 5,
    eventRow: 6,
    dataStartRow: 7,
    dataEndRow: 41
  },
  {
    name: "secondHalf",
    dayStart: 16,
    dayEnd: 31,
    headerRow: 45,
    weekdayRow: 46,
    eventRow: 47,
    dataStartRow: 48,
    dataEndRow: 82
  }
];

/**
 * metrics フィールド対応
 * [firstHalfRow, secondHalfRow]
 */
var METRIC_ROW_MAP = {
  totalSales: [9, 50],
  entranceSales: [10, 51],
  venueFee: [11, 52],
  discount: [12, 53],
  foodDrinkSales: [13, 54],
  drinkSales: [14, 55],
  foodSales: [15, 56],
  bandFoodDrinkSales: [16, 57],
  takeoutSales: [19, 60],
  karaokeSales: [20, 61],
  hallRentalSales: [21, 62],
  outsourcedSales: [22, 63],
  receivableTotal: [23, 64],
  creditCardSales: [24, 65],
  paypaySales: [25, 66],
  cash: [36, 77],
  cumulativeCash: [37, 78],
  purchaseTotal: [27, 68],
  drinkPurchase: [28, 69],
  foodPurchase: [29, 70],
  expense: [30, 71],
  bandGuarantee: [31, 72],
  laborCost: [32, 73],
  employeeCount: [33, 74],
  partTimeCount: [34, 75],
  operatingProfit: [35, 76],
  targetSales: [38, 79],
  targetAchievementRate: [39, 80],
  customerUnitPrice: [40, 81],
  foodDrinkUnitPrice: [41, 82]
};

var METRIC_KEYS = Object.keys(METRIC_ROW_MAP);

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var targetMonth = normalizeTargetMonth_(params.targetMonth);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = resolveSheet_(ss, params.sheetName, targetMonth);

    var lastRow = Math.max(sheet.getLastRow(), 82);
    var lastCol = Math.max(sheet.getLastColumn(), 40);
    var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    var expanded = expandSheetValuesIfNeeded_(sheet, values, BLOCKS, lastRow);
    values = expanded.values;
    lastCol = expanded.lastCol;

    var metaWarnings = [];
    var records = [];

    var blockIndex;
    for (blockIndex = 0; blockIndex < BLOCKS.length; blockIndex++) {
      var block = BLOCKS[blockIndex];
      var dayColumns = detectDayColumns_(values, block, blockIndex, metaWarnings);

      var i;
      for (i = 0; i < dayColumns.length; i++) {
        var entry = dayColumns[i];
        var day = entry.day;
        var col = entry.col;

        var businessDate = makeBusinessDate_(targetMonth, day);
        if (!businessDate) {
          metaWarnings.push(
            "Invalid calendar date: " +
            targetMonth + "-" + pad2_(day) +
            " (block=" + block.name + ", col=" + col + ")"
          );
          continue;
        }

        var weekday = readCell_(values, block.weekdayRow, col);
        var sheetEventName = readCell_(values, block.eventRow, col);

        var flags = {
          hasFormulaError: false,
          isEmptyDay: false,
          hasMissingEventName: !sheetEventName,
          isDuplicateBusinessDate: false
        };

        var metrics = {};
        var raw = {};

        var k;
        for (k = 0; k < METRIC_KEYS.length; k++) {
          var key = METRIC_KEYS[k];
          var row = METRIC_ROW_MAP[key][blockIndex];
          var rawValue = readCell_(values, row, col);
          var parsed = parseNumericCell_(rawValue);

          if (parsed.hasFormulaError) {
            flags.hasFormulaError = true;
          }
          metrics[key] = parsed.value;
          raw[key] = rawValue;
        }

        flags.isEmptyDay = (metrics.totalSales === null);

        records.push({
          businessDate: businessDate,
          weekday: weekday || null,
          sheetEventName: sheetEventName || null,
          sourceBlock: block.name,
          sourceColumn: col,
          sourceColumnLetter: columnToLetter_(col),
          sourceDay: day,
          metrics: metrics,
          flags: flags,
          raw: raw
        });
      }
    }

    markDuplicateBusinessDates_(records);

    var monthlyBuilt = buildMonthlySummary_(values, BLOCKS, metaWarnings);

    records.sort(function(a, b) {
      var d = a.businessDate.localeCompare(b.businessDate);
      if (d !== 0) return d;
      return (a.sourceColumn || 0) - (b.sourceColumn || 0);
    });

    var payload = {
      meta: {
        schemaVersion: "1.3.0",
        spreadsheetId: SPREADSHEET_ID,
        sheetName: sheet.getName(),
        targetMonth: targetMonth,
        generatedAt: new Date().toISOString(),
        blocks: buildBlocksMeta_(),
        monthlySummarySources: monthlyBuilt.sources,
        warnings: metaWarnings
      },
      records: records,
      monthlySummary: monthlyBuilt.summary
    };

    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var errorPayload = buildErrorPayload_(err);
    return ContentService
      .createTextOutput(JSON.stringify(errorPayload))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 月合計欄（イベント行が「合計」の列）から monthlySummary を構築
 * - 上段・下段それぞれに合計列があれば数値を合算
 * - 費用系・営業利益は日別 record 合算ではなくこちらを優先して利用
 */
function buildMonthlySummary_(values, blocks, warnings) {
  var partials = [];
  var sources = [];
  var bi;

  for (bi = 0; bi < blocks.length; bi++) {
    var block = blocks[bi];
    var col = detectMonthlyTotalColumn_(values, block);
    if (col === null) continue;

    var metrics = readMetricsAtColumn_(values, bi, col);
    partials.push(metrics);
    sources.push(buildMonthlySummarySource_(block, bi, col));
  }

  if (partials.length === 0) {
    warnings.push("No monthly total column (合計) detected on sheet");
    return { summary: null, sources: sources };
  }

  return {
    summary: mergeMonthlySummaryPartials_(partials),
    sources: sources
  };
}

function detectMonthlyTotalColumn_(values, block) {
  var eventRow = values[block.eventRow - 1] || [];
  var i;
  for (i = 0; i < eventRow.length; i++) {
    var label = String(eventRow[i] || "").trim();
    if (label === "合計") {
      return i + 1;
    }
  }
  return null;
}

function readMetricsAtColumn_(values, blockIndex, col) {
  var metrics = {};
  var k;
  for (k = 0; k < METRIC_KEYS.length; k++) {
    var key = METRIC_KEYS[k];
    var row = METRIC_ROW_MAP[key][blockIndex];
    var rawValue = readCell_(values, row, col);
    var parsed = parseNumericCell_(rawValue);
    metrics[key] = parsed.value;
  }
  return metrics;
}

function buildMonthlySummarySource_(block, blockIndex, col) {
  var metricRows = {};
  var k;
  for (k = 0; k < METRIC_KEYS.length; k++) {
    var key = METRIC_KEYS[k];
    metricRows[key] = METRIC_ROW_MAP[key][blockIndex];
  }

  return {
    block: block.name,
    column: col,
    columnLetter: columnToLetter_(col),
    eventRow: block.eventRow,
    metricRows: metricRows
  };
}

function mergeMonthlySummaryPartials_(partials) {
  var out = {};
  var keys = [
    "totalSales",
    "targetSales",
    "foodDrinkSales",
    "drinkSales",
    "foodSales",
    "purchaseTotal",
    "drinkPurchase",
    "foodPurchase",
    "expense",
    "laborCost",
    "bandGuarantee",
    "operatingProfit"
  ];

  var ki;
  for (ki = 0; ki < keys.length; ki++) {
    var key = keys[ki];
    var sum = 0;
    var hasAny = false;
    var pi;
    for (pi = 0; pi < partials.length; pi++) {
      var v = partials[pi][key];
      if (v !== null && v !== undefined && isFinite(v)) {
        sum += v;
        hasAny = true;
      }
    }
    out[key] = hasAny ? sum : null;
  }

  return out;
}

function buildBlocksMeta_() {
  var out = [];
  var i;
  for (i = 0; i < BLOCKS.length; i++) {
    var b = BLOCKS[i];
    out.push({
      name: b.name,
      dayStart: b.dayStart,
      dayEnd: b.dayEnd,
      headerRow: b.headerRow,
      weekdayRow: b.weekdayRow,
      eventRow: b.eventRow,
      dataStartRow: b.dataStartRow,
      dataEndRow: b.dataEndRow
    });
  }
  return out;
}

function resolveSheet_(ss, sheetNameParam, targetMonth) {
  var allNames = getAllSheetNames_(ss);

  if (sheetNameParam && String(sheetNameParam).trim()) {
    var directName = String(sheetNameParam).trim();
    var direct = ss.getSheetByName(directName);
    if (!direct) {
      throw buildSheetNotFoundError_(
        "Sheet not found by sheetName: " + directName,
        allNames,
        []
      );
    }
    return direct;
  }

  var candidates = buildSheetCandidatesFromMonth_(targetMonth);
  var i;
  for (i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var s = ss.getSheetByName(c);
    if (s) return s;
  }

  throw buildSheetNotFoundError_(
    "Sheet not found from targetMonth: " + targetMonth,
    allNames,
    candidates
  );
}

function getAllSheetNames_(ss) {
  var arr = [];
  var sheets = ss.getSheets();
  var i;
  for (i = 0; i < sheets.length; i++) {
    arr.push(sheets[i].getName());
  }
  return arr;
}

function buildSheetCandidatesFromMonth_(targetMonth) {
  var parts = targetMonth.split("-");
  var yStr = parts[0];
  var mStr = parts[1];
  var y = Number(yStr);
  var m = Number(mStr);
  var mNoPad = String(m);
  var mPad = pad2_(m);

  var list = [
    String(y) + "年" + mNoPad + "月",
    String(y) + "年" + mPad + "月",
    mNoPad + "月",
    mPad + "月",
    String(y) + "/" + mNoPad,
    String(y) + "/" + mPad,
    String(y) + "-" + mPad,
    String(y) + "年" + mNoPad + "月日次決算",
    String(y) + "年" + mPad + "月日次決算"
  ];

  return uniqueStrings_(list);
}

function uniqueStrings_(list) {
  var map = {};
  var out = [];
  var i;
  for (i = 0; i < list.length; i++) {
    var v = list[i];
    if (!map[v]) {
      map[v] = true;
      out.push(v);
    }
  }
  return out;
}

function normalizeTargetMonth_(targetMonthParam) {
  var re = /^\d{4}-\d{2}$/;
  if (targetMonthParam && re.test(targetMonthParam)) {
    return targetMonthParam;
  }

  var now = new Date();
  var y = now.getFullYear();
  var m = pad2_(now.getMonth() + 1);
  return String(y) + "-" + m;
}

/**
 * シート右端の追加日付列（例: 3月の上段右側 1日/25日/29日）まで読み取る
 */
function expandSheetValuesIfNeeded_(sheet, values, blocks, lastRow) {
  var lastCol = values[0] ? values[0].length : 0;
  var neededCol = findNeededLastColumn_(values, blocks);
  if (neededCol <= lastCol) {
    return { values: values, lastCol: lastCol };
  }
  lastCol = Math.max(neededCol, sheet.getLastColumn(), 40);
  return {
    values: sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues(),
    lastCol: lastCol
  };
}

function findNeededLastColumn_(values, blocks) {
  var maxCol = 1;
  var bi;
  for (bi = 0; bi < blocks.length; bi++) {
    var block = blocks[bi];
    var header = values[block.headerRow - 1] || [];
    var ci;
    for (ci = 0; ci < header.length; ci++) {
      var day = parseDayFromHeaderCell_(header[ci]);
      if (day !== null) {
        maxCol = Math.max(maxCol, ci + 1);
      }
    }
    var scanRows = [block.weekdayRow, block.eventRow, block.dataStartRow, block.dataEndRow];
    var si;
    for (si = 0; si < scanRows.length; si++) {
      var row = values[scanRows[si] - 1] || [];
      for (ci = 0; ci < row.length; ci++) {
        if (String(row[ci] || "").trim() !== "") {
          maxCol = Math.max(maxCol, ci + 1);
        }
      }
    }
  }
  return maxCol;
}

/**
 * 日付ヘッダー行から列を検出（列番号ベース。値は必ず同一列から取得）
 * - block.dayStart/dayEnd では絞らない（1..31 すべて対象）
 * - 「1日」「25日」形式にも対応
 * - 上段右側の追加列も検出
 * - 列の並べ替えはしない（左→右の列順で record 化）
 */
function detectDayColumns_(values, block, blockIndex, warnings) {
  var header = values[block.headerRow - 1] || [];
  var entries = [];

  var i;
  for (i = 0; i < header.length; i++) {
    var col = i + 1;
    var day = parseDayFromHeaderCell_(header[i]);
    if (day === null) continue;

    if (!isPlausibleDayColumn_(values, block, blockIndex, col)) {
      continue;
    }

    entries.push({ day: day, col: col });
  }

  if (entries.length === 0) {
    warnings.push("No day columns detected in block=" + block.name + " (headerRow=" + block.headerRow + ")");
  }

  var dayCount = {};
  for (i = 0; i < entries.length; i++) {
    var d = entries[i].day;
    dayCount[d] = (dayCount[d] || 0) + 1;
  }

  for (var key in dayCount) {
    if (dayCount.hasOwnProperty(key) && dayCount[key] > 1) {
      warnings.push("Duplicate day columns in block=" + block.name + ": day=" + key + ", count=" + dayCount[key]);
    }
  }

  return entries;
}

/**
 * ヘッダー日付セル解析: 1 / 1日 / １日 など
 */
function parseDayFromHeaderCell_(cell) {
  var s = toHalfWidthDigits_(String(cell || "").trim());
  if (!s) return null;

  var m = s.match(/^(\d{1,2})\s*日?$/);
  if (m) {
    var day = Number(m[1]);
    if (day >= 1 && day <= 31) return day;
  }

  var n = Number(s);
  if (isFinite(n) && Math.floor(n) === n && n >= 1 && n <= 31) return n;

  return null;
}

function toHalfWidthDigits_(s) {
  return String(s || "").replace(/[０-９]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 65248);
  });
}

/**
 * 日付ヘッダー以外の数値誤検出を避ける（イベント名・曜日・売上のいずれかがある列のみ）
 */
function isPlausibleDayColumn_(values, block, blockIndex, col) {
  var eventName = readCell_(values, block.eventRow, col);
  if (eventName) return true;

  var weekday = readCell_(values, block.weekdayRow, col);
  if (weekday && /[月火水木金土日]/.test(weekday)) return true;

  var totalRow = METRIC_ROW_MAP.totalSales[blockIndex];
  var totalRaw = readCell_(values, totalRow, col);
  var parsed = parseNumericCell_(totalRaw);
  if (parsed.value !== null) return true;

  return false;
}

function makeBusinessDate_(targetMonth, day) {
  var parts = targetMonth.split("-");
  var yStr = parts[0];
  var mStr = parts[1];
  var y = Number(yStr);
  var m = Number(mStr);

  if (!y || !m || !day) return null;

  var d = new Date(y, m - 1, day);
  if (d.getFullYear() !== y || (d.getMonth() + 1) !== m || d.getDate() !== day) {
    return null;
  }

  return yStr + "-" + mStr + "-" + pad2_(day);
}

function readCell_(values, row1Based, col1Based) {
  var r = values[row1Based - 1];
  if (!r) return "";
  var v = r[col1Based - 1];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseNumericCell_(raw) {
  var s = String(raw === null || raw === undefined ? "" : raw).trim();

  if (!s) return { value: null, hasFormulaError: false };
  if (/^#DIV\/0!$/i.test(s)) return { value: null, hasFormulaError: true };

  var normalized = s;
  normalized = normalized.replace(/\s/g, "");
  normalized = normalized.replace(/¥|￥/g, "");
  normalized = normalized.replace(/,/g, "");
  normalized = normalized.replace(/％/g, "%");
  normalized = normalized.replace(/^△/, "-");

  if (normalized.charAt(normalized.length - 1) === "%") {
    normalized = normalized.substring(0, normalized.length - 1);
  }

  if (!normalized) return { value: null, hasFormulaError: false };

  var n = Number(normalized);
  if (!isFinite(n)) return { value: null, hasFormulaError: false };

  return { value: n, hasFormulaError: false };
}

function markDuplicateBusinessDates_(records) {
  var countMap = {};
  var i;

  for (i = 0; i < records.length; i++) {
    var d = records[i].businessDate;
    countMap[d] = (countMap[d] || 0) + 1;
  }

  for (i = 0; i < records.length; i++) {
    if (!records[i].flags) records[i].flags = {};
    records[i].flags.isDuplicateBusinessDate = (countMap[records[i].businessDate] || 0) > 1;
  }
}

function buildSheetNotFoundError_(message, availableSheets, candidates) {
  var err = new Error(message);
  err.name = "SheetResolutionError";
  err.details = {
    availableSheets: availableSheets || [],
    triedCandidates: candidates || []
  };
  return err;
}

function buildErrorPayload_(err) {
  var payload = {
    meta: {
      schemaVersion: "1.3.0",
      generatedAt: new Date().toISOString(),
      warnings: []
    },
    records: [],
    monthlySummary: null,
    error: {
      name: (err && err.name) ? err.name : "Error",
      message: (err && err.message) ? err.message : String(err)
    }
  };

  if (err && err.details) {
    payload.error.details = err.details;
  }

  if (
    err &&
    err.name === "SheetResolutionError" &&
    err.details &&
    err.details.availableSheets
  ) {
    payload.error.availableSheets = err.details.availableSheets;
    payload.error.triedCandidates = err.details.triedCandidates || [];
  }

  return payload;
}

function columnToLetter_(col) {
  var n = Number(col || 0);
  if (!(n > 0)) return "";
  var s = "";
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function pad2_(n) {
  var s = String(n);
  if (s.length < 2) return "0" + s;
  return s;
}
