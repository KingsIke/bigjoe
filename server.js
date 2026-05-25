const express = require("express");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3300;
const TE_COCOA = "https://tradingeconomics.com/commodity/cocoa";

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

function toNumber(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseTradingEconomics(html) {
  const text = stripHtml(html);
  const out = {
    ok: true,
    source: "tradingeconomics.com",
    scrapedAt: new Date().toISOString(),
    error: null,
    price: null,
    unit: "USD/MT",
    dayChange: null,
    dayChangePct: null,
    monthChangePct: null,
    yearChangePct: null,
    previousClose: null,
    yearHigh: null,
    yearLow: null,
    forecastEndQuarter: null,
    forecast12m: null,
    headline: "",
    chartSeries: syntheticSeries(14),
    news: [],
  };

  const summary = text.match(/Cocoa\s+(?:rose|increased|fell|decreased|traded|was)\s+(?:to|at|around)?\s*\$?([\d,]+(?:\.\d+)?)\s*(?:USD\/T|USD\/MT|per tonne)/i);
  if (summary) out.price = toNumber(summary[1]);

  const daily = text.match(/Cocoa\s+(?:rose|increased|fell|decreased)\s+to\s+[\d,]+(?:\.\d+)?\s*USD\/T\s+on\s+[^,]+,\s+(up|down)\s+([\d.]+)%/i);
  if (daily) out.dayChangePct = (daily[1].toLowerCase() === "down" ? -1 : 1) * toNumber(daily[2]);

  const tableRow = text.match(/\bCocoa\s+([\d,]+(?:\.\d+)?)\s+(-?[\d,]+(?:\.\d+)?)\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+[A-Z][a-z]{2}\/\d{2}\b/);
  if (tableRow) {
    out.price = toNumber(tableRow[1]);
    out.dayChange = toNumber(tableRow[2]);
    out.dayChangePct = toNumber(tableRow[3]);
    out.monthChangePct = toNumber(tableRow[4]);
    out.yearChangePct = toNumber(tableRow[5]);
  }

  const stats = text.match(/Actual\s+Previous\s+Highest\s+Lowest\s+Dates\s+Unit\s+Frequency\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/i);
  if (stats) {
    out.price = toNumber(stats[1]);
    out.previousClose = toNumber(stats[2]);
    out.yearHigh = toNumber(stats[3]);
    out.yearLow = toNumber(stats[4]);
  }

  const allTimeHigh = text.match(/all time high of\s+([\d,]+(?:\.\d+)?)/i);
  if (allTimeHigh && out.yearHigh == null) out.yearHigh = toNumber(allTimeHigh[1]);

  const month = text.match(/past month,\s*Cocoa'?s price has\s+(?:risen|increased|fallen|decreased)\s+([\d.]+)%/i);
  if (month && out.monthChangePct == null) out.monthChangePct = toNumber(month[1]);
  const year = text.match(/(?:it is still|is)\s+([\d.]+)%\s+(lower|higher)\s+than a year ago/i);
  if (year && out.yearChangePct == null) out.yearChangePct = (year[2].toLowerCase() === "lower" ? -1 : 1) * toNumber(year[1]);

  const fq = text.match(/trade at\s+([\d,]+(?:\.\d+)?)\s+USD\/MT\s+by the end of this quarter/i);
  if (fq) out.forecastEndQuarter = toNumber(fq[1]);
  const f12 = text.match(/trade at\s+([\d,]+(?:\.\d+)?)\s+in\s+12\s+months/i);
  if (f12) out.forecast12m = toNumber(f12[1]);

  const headline = text.match(/Cocoa futures[^.]+(?:\.[^.]+)?/i);
  out.headline = headline ? headline[0].slice(0, 500) : `Cocoa — ${out.price} USD/MT`;

  const newsMatches = [...html.matchAll(/<a[^>]+href=["'][^"']*\/commodity\/cocoa\/news\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
  out.news = newsMatches
    .map((m) => stripHtml(m[1]).slice(0, 200))
    .filter(Boolean)
    .slice(0, 6);
  if (!out.news.length) out.news = fallbackPayload().news;

  if (out.price == null) throw new Error("Could not read cocoa price");
  return out;
}

async function fetchFromTradingEconomics() {
  if (!global.fetch) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    console.log(`[TE] Fetching from ${TE_COCOA}`);
    const response = await fetch(TE_COCOA, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseTradingEconomics(await response.text());
  } catch (e) {
    console.log(`[TE] Error: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  // Fetch live data first. The CDN copy can become stale if the external sync job stops.
  const liveData = await fetchFromTradingEconomics();
  if (liveData) {
    cache = { payload: liveData, at: Date.now() };
    return res.json({ ...liveData, cached: false });
  }

  // Fall back to CDN
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
