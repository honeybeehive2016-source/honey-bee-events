// イベント予約ステータス（公開フォームと管理画面で共有）

export const BOOKING_STATUS_OPTIONS = [
  { value: "pending_detail", label: "詳細確認中" },
  { value: "pending_booking", label: "予約受付前" },
  { value: "open", label: "予約受付中" },
  { value: "closed", label: "受付終了" },
];

/** Firestore で未設定の既存イベントは公開フォーム上は「予約受付中」と同等 */
export function effectiveBookingStatus(ev) {
  const s = ev?.bookingStatus;
  if (s === undefined || s === null || String(s).trim() === "") return "open";
  return String(s).trim();
}

/** お客様用予約フォームで選択できるか（日付・貸切除外・noBooking は呼び出し側と合わせる） */
export function isCustomerBookingStatusOpen(ev) {
  return effectiveBookingStatus(ev) === "open";
}
