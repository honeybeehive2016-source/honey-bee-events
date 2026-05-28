const APPS_SCRIPT_SALES_ENDPOINT =
  process.env.APPS_SCRIPT_SALES_ENDPOINT ||
  "https://script.google.com/macros/s/AKfycbyDJKp0uKJT_qqhS667Mmy3amDo53Hq1ENASe7T_JSnzGZEhSNkrypdAa9rxICbzT6D/exec";

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const month = typeof req.query?.targetMonth === "string" ? req.query.targetMonth : "";
    const baseUrl = String(APPS_SCRIPT_SALES_ENDPOINT || "").replace(/[?&]+$/, "");
    const sep = baseUrl.includes("?") ? "&" : "?";
    const upstreamUrl = baseUrl + sep + "targetMonth=" + encodeURIComponent(month);

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();
    const upstreamContentType = upstream.headers.get("content-type") || "";
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "Invalid JSON from upstream Apps Script",
        upstreamStatus: upstream.status,
        upstreamContentType,
        preview: text?.slice(0, 300),
      });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({
      error: "Failed to fetch Apps Script endpoint",
      detail: e?.message || String(e),
    });
  }
};
