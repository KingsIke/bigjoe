const express = require("express");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3300;

// Cloudinary CDN URL (set via env or default)
const CDN_JSON_URL = process.env.CDN_JSON_URL || "https://res.cloudinary.com/logistics-kingsike/raw/upload/ogbo/cocoa-latest.json";

// Cache
let cache = { payload: null, at: 0 };
const CACHE_MS = parseInt(process.env.CACHE_MS || "120000", 10);

function syntheticSeries(months = 14) {
  const now = Date.now();
  const day = 86400000;
  const base = 3250;
  const pts = [];
  for (let i = months * 30; i >= 0; i -= 30) {
    const t = now - i * day;
    const wobble = Math.sin(i / 40) * 400 + (Math.random() - 0.5) * 120;
    pts.push([t, Math.max(800, base + wobble + (months * 30 - i) * 2)]);
  }
  return pts;
}

function fallbackPayload(errMsg) {
  return {
    ok: true, source: "fallback", scrapedAt: new Date().toISOString(), error: errMsg || null,
    price: 3250.25, unit: "USD/MT", dayChange: 5.25, dayChangePct: 0.16, monthChangePct: 6.22,
    yearChangePct: -61.76, previousClose: 3245.0, yearHigh: 12906.0, yearLow: 0.91,
    forecastEndQuarter: 3112.95, forecast12m: 2718.18,
    headline: "Cocoa rose to 3,250.25 USD/T — simulated data when live scrape is unavailable.",
    chartSeries: syntheticSeries(14),
    news: ["Cocoa futures consolidate near 2023 lows amid supply outlook.",
      "West African mid-crop weather supports harvest expectations.",
      "ICE certified stocks trend higher; market watches grind data."],
  };
}

async function fetchFromCDN() {
  if (!CDN_JSON_URL) return null;
  return new Promise((resolve) => {
    console.log(`[CDN] Fetching from ${CDN_JSON_URL}`);
    https.get(CDN_JSON_URL, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            console.log(`[CDN] Parse error: ${e.message}`);
            resolve(null);
          }
        } else {
          console.log(`[CDN] HTTP ${res.statusCode}`);
          resolve(null);
        }
      });
    }).on("error", (e) => {
      console.log(`[CDN] Error: ${e.message}`);
      resolve(null);
    });
  });
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/api/cocoa", async (req, res) => {
  // Check cache first
  if (cache.payload && Date.now() - cache.at < CACHE_MS) {
    return res.json({ ...cache.payload, cached: true });
  }

  // Fetch from CDN
  const data = await fetchFromCDN();
  if (data) {
    cache = { payload: data, at: Date.now() };
    return res.json({ ...data, cached: false });
  }

  // Fallback
  const payload = fallbackPayload("CDN unavailable");
  cache = { payload, at: Date.now() };
  res.json({ ...payload, cached: false });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`OGBO Cocoa app at http://localhost:${PORT}`);
  console.log(`[CDN] Source: ${CDN_JSON_URL}`);
});
