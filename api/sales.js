const APPS_SCRIPT_SALES_ENDPOINT =
  process.env.APPS_SCRIPT_SALES_ENDPOINT ||
  "https://script.google.com/macros/s/AKfycbyc4qjhJ0JrbYfbmqGH2eUQUVgWuUSUnPBBMstDRL4jR4l76T7f_ba25REkbb_Fw74/exec";

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const month = typeof req.query?.targetMonth === "string" ? req.query.targetMonth : "";
    const sep = APPS_SCRIPT_SALES_ENDPOINT.includes("?") ? "&" : "?";
    const upstreamUrl = `${APPS_SCRIPT_SALES_ENDPOINT}${sep}targetMonth=${encodeURIComponent(month)}`;

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "Invalid JSON from upstream Apps Script",
        upstreamStatus: upstream.status,
        upstreamBody: text?.slice(0, 500),
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
