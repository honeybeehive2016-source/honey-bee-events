const BUSINESS_DAY_SWITCH_HOUR = 1; // 25:00切り替え（実際は翌01:00）

function toDateKey(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function getDateKey(date = new Date()) {
  return toDateKey(date);
}

// 深夜 00:00〜00:59 は前日営業日として扱う
export function getBusinessDate(date = new Date()) {
  const d = new Date(date);
  if (d.getHours() < BUSINESS_DAY_SWITCH_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return toDateKey(d);
}

export function getBusinessDateInfo(date = new Date()) {
  const actualDate = getDateKey(date);
  const businessDate = getBusinessDate(date);
  return {
    actualDate,
    businessDate,
    isOvernightWindow: actualDate !== businessDate,
    switchLabel: "25:00切り替え",
  };
}

