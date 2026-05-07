import { getBusinessDateInfo } from "./businessDate";

export default function BusinessDateBadge({ date }) {
  const info = getBusinessDateInfo(date);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: ".45rem",
        padding: ".3rem .6rem",
        borderRadius: 999,
        border: "1px solid rgba(201,168,76,0.3)",
        background: "rgba(201,168,76,0.08)",
        color: "rgba(240,232,208,0.78)",
        fontSize: ".62rem",
        letterSpacing: ".03em",
        lineHeight: 1.5,
      }}
      title="営業日は25:00（翌1:00）で切り替わります"
    >
      <span style={{ color: "#c9a84c", fontWeight: 600 }}>営業日：{info.businessDate}</span>
      <span style={{ color: "rgba(201,168,76,0.78)" }}>{info.switchLabel}</span>
      {info.isOvernightWindow && (
        <span style={{ color: "rgba(240,232,208,0.62)" }}>実日付：{info.actualDate}</span>
      )}
    </div>
  );
}

