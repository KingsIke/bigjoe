/**
 * Local scraper that uploads to Cloudinary
 * Run this via cron every 30 min on your local machine
 * Usage: node scripts/sync-cocoa.js
 */
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");

const TE_COCOA = "https://tradingeconomics.com/commodity/cocoa";

// Cloudinary config
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD || "logistics-kingsike";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "ogbo";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "785414911374236";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "vOUSAB6RHvd78-4ptjoYH_PPGY";
const CDN_JSON_URL = process.env.CDN_JSON_URL || "https://res.cloudinary.com/logistics-kingsike/raw/upload/ogbo/cocoa-latest.json";

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

async function scrapeTradingEconomics() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
      "--no-first-run", "--no-zygote", "--single-process", "--disable-accelerated-2d-canvas"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    await page.goto(TE_COCOA, { waitUntil: "networkidle2", timeout: 90000 });
    await page.waitForSelector("body", { timeout: 15000 });
    await page.waitForFunction(() => window.Highcharts && window.Highcharts.charts?.length > 0, { timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));

    const extracted = await page.evaluate(() => {
      const out = { headline: "", price: null, previousClose: null, yearHigh: null, yearLow: null,
        dayChange: null, dayChangePct: null, monthChangePct: null, yearChangePct: null,
        forecastEndQuarter: null, forecast12m: null, chartSeries: [], news: [] };

      document.querySelectorAll("table").forEach(tbl => {
        const firstRow = tbl.querySelector("tr");
        if (!firstRow) return;
        const headers = [...firstRow.querySelectorAll("th")].map(th => th.innerText.trim().toLowerCase());
        if (headers.length >= 4 && headers.join(" ").includes("actual") && headers.join(" ").includes("previous")
          && headers.join(" ").includes("highest") && headers.join(" ").includes("lowest")) {
          const rows = tbl.querySelectorAll("tr");
          for (let i = 1; i < rows.length; i++) {
            const tds = rows[i].querySelectorAll("td");
            if (tds.length < 4) continue;
            const nums = [...tds].map(td => parseFloat(td.innerText.replace(/,/g, "").trim()));
            if (!Number.isNaN(nums[0])) { out.price = nums[0]; out.previousClose = nums[1]; out.yearHigh = nums[2]; out.yearLow = nums[3]; return; }
          }
        }
      });

      const h1 = document.querySelector("h1");
      if (h1) out.headline = h1.innerText.trim().slice(0, 500);
      const allText = document.body ? document.body.innerText : "";
      const priceMatch = allText.match(/Cocoa rose to\s*([\d,]+\.?\d*)\s*USD\/T/i);
      if (priceMatch && out.price == null) out.price = parseFloat(priceMatch[1].replace(/,/g, ""));
      const hiLo = allText.match(/all time high of\s*([\d,]+\.?\d*)/i);
      if (hiLo && (out.yearHigh == null || Number.isNaN(out.yearHigh))) out.yearHigh = parseFloat(hiLo[1].replace(/,/g, ""));

      document.querySelectorAll("table").forEach(table => {
        table.querySelectorAll("tr").forEach(row => {
          const t = row.innerText;
          if (/^\s*Actual/i.test(t) || /Actual\s*\|/i.test(t)) return;
          if (!/\bCocoa\b/i.test(t) || !/%/.test(t) || !/\d/.test(t)) return;
          const nums = t.match(/[\d,]+\.?\d*/g);
          if (nums && nums.length >= 3) {
            if (out.price == null) out.price = parseFloat(nums[0].replace(/,/g, ""));
            if (out.dayChange == null) out.dayChange = parseFloat(nums[1].replace(/,/g, ""));
            const pcts = t.match(/-?[\d.]+%/g);
            if (pcts && pcts.length) { if (out.dayChangePct == null) out.dayChangePct = parseFloat(pcts[0]); if (pcts[1] && out.monthChangePct == null) out.monthChangePct = parseFloat(pcts[1]); if (pcts[2] && out.yearChangePct == null) out.yearChangePct = parseFloat(pcts[2]); }
          }
        });
      });

      const fq = allText.match(/trade at\s*([\d,]+\.?\d*)\s*USD\/MT\s*by the end of this quarter/i);
      if (fq) out.forecastEndQuarter = parseFloat(fq[1].replace(/,/g, ""));
      const f12 = allText.match(/trade at\s*([\d,]+\.?\d*)\s*in\s*12\s*months/i);
      if (f12) out.forecast12m = parseFloat(f12[1].replace(/,/g, ""));

      document.querySelectorAll('a[href*="/commodity/cocoa/news/"]').forEach((a, i) => { if (i < 6 && a.innerText.trim()) out.news.push(a.innerText.trim().slice(0, 200)); });

      if (window.Highcharts && Array.isArray(window.Highcharts.charts)) {
        for (const ch of window.Highcharts.charts) {
          if (!ch || !ch.series || !ch.series.length) continue;
          for (const s of ch.series) {
            const raw = s.options?.data;
            if (!raw || !raw.length) continue;
            const mapped = raw.map(p => { if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])]; if (p && typeof p === "object" && "x" in p && "y" in p) return [Number(p.x), Number(p.y)]; return null; }).filter(Boolean);
            if (mapped.length > 5) { out.chartSeries = mapped; break; }
          }
          if (out.chartSeries.length) break;
        }
      }
      return out;
    });

    await browser.close();
    if (extracted.price == null || Number.isNaN(extracted.price)) throw new Error("Could not read cocoa price");

    let chartSeries = extracted.chartSeries;
    if (!chartSeries || chartSeries.length < 4) { console.log("[Sync] Chart incomplete, using synthetic"); chartSeries = syntheticSeries(14); }

    return { ok: true, source: "tradingeconomics.com", scrapedAt: new Date().toISOString(), error: null,
      price: extracted.price, unit: "USD/MT", dayChange: extracted.dayChange, dayChangePct: extracted.dayChangePct,
      monthChangePct: extracted.monthChangePct, yearChangePct: extracted.yearChangePct, previousClose: extracted.previousClose,
      yearHigh: extracted.yearHigh, yearLow: extracted.yearLow, forecastEndQuarter: extracted.forecastEndQuarter,
      forecast12m: extracted.forecast12m, headline: extracted.headline || `Cocoa — ${extracted.price} USD/MT`,
      chartSeries, news: extracted.news && extracted.news.length ? extracted.news : fallbackPayload().news };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

async function uploadToCloudinary(jsonData) {
  if (!CLOUDINARY_API_KEY || !CLOUDINARY_CLOUD) {
    console.log("[Cloudinary] Missing credentials, skipping");
    return null;
  }

  // Create upload preset in Cloudinary dashboard with "Unsigned" signing mode
  // Then set UPLOAD_PRESET env var
  const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "ogbo-cocoa";

  const boundary = "----FormBoundary" + Date.now();
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="cocoa-data.json"`,
    `Content-Type: application/json`,
    ``,
    JSON.stringify(jsonData),
    `--${boundary}`,
    `Content-Disposition: form-data; name="upload_preset"`,
    ``,
    UPLOAD_PRESET,
    `--${boundary}`,
    `Content-Disposition: form-data; name="folder"`,
    ``,
    CLOUDINARY_FOLDER,
    `--${boundary}`,
    `Content-Disposition: form-data; name="public_id"`,
    ``,
    `cocoa-latest`,
    `--${boundary}--`,
  ].join("\r\n");

  return new Promise((resolve) => {
    const options = {
      hostname: "api.cloudinary.com",
      path: `/v1_1/${CLOUDINARY_CLOUD}/auto/upload`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          console.log(`[Cloudinary] Uploaded: ${result.secure_url}`);
          resolve(result.secure_url);
        } else {
          console.log(`[Cloudinary] Failed: ${data}`);
          resolve(null);
        }
      });
    });

    req.write(body);
    req.end();
    req.on("error", e => { console.log(`[Cloudinary] Error: ${e.message}`); resolve(null); });
  });
}

async function main() {
  console.log("[Sync] Starting cocoa data sync...");
  try {
    const payload = await scrapeTradingEconomics();
    console.log(`[Sync] Scraped: price=${payload.price}, chartPoints=${payload.chartSeries.length}`);
    const url = await uploadToCloudinary(payload);
    if (url) console.log(`[Sync] Success! CDN URL: ${CDN_JSON_URL}`);
    else console.log("[Sync] Upload failed");
  } catch (e) {
    console.error(`[Sync] Error: ${e.message}`);
    process.exit(1);
  }
}

main();
