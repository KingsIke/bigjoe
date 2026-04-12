const express = require("express");
const path = require("path");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3300;

const TE_COCOA = "https://tradingeconomics.com/commodity/cocoa";

let cache = { payload: null, at: 0 };
const CACHE_MS = parseInt(process.env.COCOA_CACHE_MS || "45000", 10);

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
    ok: true,
    source: "fallback",
    scrapedAt: new Date().toISOString(),
    error: errMsg || null,
    price: 3250.25,
    unit: "USD/MT",
    dayChange: 5.25,
    dayChangePct: 0.16,
    monthChangePct: 6.22,
    yearChangePct: -61.76,
    previousClose: 3245.0,
    yearHigh: 12906.0,
    yearLow: 0.91,
    forecastEndQuarter: 3112.95,
    forecast12m: 2718.18,
    headline:
      "Cocoa rose to 3,250.25 USD/T — simulated data when live scrape is unavailable.",
    chartSeries: syntheticSeries(14),
    news: [
      "Cocoa futures consolidate near 2023 lows amid supply outlook.",
      "West African mid-crop weather supports harvest expectations.",
      "ICE certified stocks trend higher; market watches grind data.",
    ],
  };
}

async function scrapeTradingEconomics() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.goto(TE_COCOA, {
      waitUntil: "networkidle2",
      timeout: 90000,
    });
    await page.waitForSelector("body", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 4000));

    const extracted = await page.evaluate(() => {
      const out = {
        headline: "",
        price: null,
        previousClose: null,
        yearHigh: null,
        yearLow: null,
        dayChange: null,
        dayChangePct: null,
        monthChangePct: null,
        yearChangePct: null,
        forecastEndQuarter: null,
        forecast12m: null,
        chartSeries: [],
        news: [],
      };

      function parseActualPreviousHighLowTable() {
        const tables = document.querySelectorAll("table");
        for (const tbl of tables) {
          const firstRow = tbl.querySelector("tr");
          if (!firstRow) continue;
          const headers = [...firstRow.querySelectorAll("th")].map((th) =>
            th.innerText.trim().toLowerCase()
          );
          if (headers.length < 4) continue;
          const joined = headers.join(" ");
          if (
            !joined.includes("actual") ||
            !joined.includes("previous") ||
            !joined.includes("highest") ||
            !joined.includes("lowest")
          ) {
            continue;
          }
          const rows = tbl.querySelectorAll("tr");
          for (let i = 1; i < rows.length; i++) {
            const tds = rows[i].querySelectorAll("td");
            if (tds.length < 4) continue;
            const nums = [];
            for (let j = 0; j < 4; j++) {
              const v = parseFloat(tds[j].innerText.replace(/,/g, "").trim());
              nums.push(v);
            }
            if (!Number.isNaN(nums[0]) && !Number.isNaN(nums[1])) {
              return {
                actual: nums[0],
                previous: nums[1],
                highest: nums[2],
                lowest: nums[3],
              };
            }
          }
        }
        return null;
      }

      const apl = parseActualPreviousHighLowTable();
      if (apl) {
        out.price = apl.actual;
        out.previousClose = apl.previous;
        out.yearHigh = apl.highest;
        out.yearLow = apl.lowest;
      }

      const h1 = document.querySelector("h1");
      if (h1) out.headline = h1.innerText.trim().slice(0, 500);

      const allText = document.body ? document.body.innerText : "";
      const priceMatch = allText.match(
        /Cocoa rose to\s*([\d,]+\.?\d*)\s*USD\/T/i
      );
      if (priceMatch && out.price == null) {
        out.price = parseFloat(priceMatch[1].replace(/,/g, ""));
      }

      const hiLo = allText.match(/all time high of\s*([\d,]+\.?\d*)/i);
      if (
        hiLo &&
        (out.yearHigh == null || Number.isNaN(out.yearHigh))
      ) {
        out.yearHigh = parseFloat(hiLo[1].replace(/,/g, ""));
      }

      document.querySelectorAll("table").forEach((table) => {
        const rows = table.querySelectorAll("tr");
        rows.forEach((row) => {
          const t = row.innerText;
          if (/^\s*Actual/i.test(t) || /Actual\s*\|/i.test(t)) return;
          if (!/\bCocoa\b/i.test(t) || !/%/.test(t) || !/\d/.test(t)) return;
          const nums = t.match(/[\d,]+\.?\d*/g);
          if (nums && nums.length >= 3) {
            if (out.price == null)
              out.price = parseFloat(nums[0].replace(/,/g, ""));
            if (out.dayChange == null)
              out.dayChange = parseFloat(nums[1].replace(/,/g, ""));
            const pcts = t.match(/-?[\d.]+%/g);
            if (pcts && pcts.length) {
              if (out.dayChangePct == null) out.dayChangePct = parseFloat(pcts[0]);
              if (pcts[1] && out.monthChangePct == null)
                out.monthChangePct = parseFloat(pcts[1]);
              if (pcts[2] && out.yearChangePct == null)
                out.yearChangePct = parseFloat(pcts[2]);
            }
          }
        });
      });

      const fq = allText.match(
        /trade at\s*([\d,]+\.?\d*)\s*USD\/MT\s*by the end of this quarter/i
      );
      if (fq) out.forecastEndQuarter = parseFloat(fq[1].replace(/,/g, ""));

      const f12 = allText.match(/trade at\s*([\d,]+\.?\d*)\s*in\s*12\s*months/i);
      if (f12) out.forecast12m = parseFloat(f12[1].replace(/,/g, ""));

      document.querySelectorAll('a[href*="/commodity/cocoa/news/"]').forEach((a, i) => {
        if (i < 6 && a.innerText.trim())
          out.news.push(a.innerText.trim().slice(0, 200));
      });

      if (window.Highcharts && Array.isArray(window.Highcharts.charts)) {
        for (const ch of window.Highcharts.charts) {
          if (!ch || !ch.series || !ch.series.length) continue;
          for (const s of ch.series) {
            const opts = s.options;
            const raw = opts && opts.data;
            if (!raw || !raw.length) continue;
            const mapped = raw
              .map((p) => {
                if (Array.isArray(p) && p.length >= 2)
                  return [Number(p[0]), Number(p[1])];
                if (p && typeof p === "object" && "x" in p && "y" in p)
                  return [Number(p.x), Number(p.y)];
                return null;
              })
              .filter(Boolean);
            if (mapped.length > 5) {
              out.chartSeries = mapped;
              break;
            }
          }
          if (out.chartSeries.length) break;
        }
      }

      return out;
    });

    await browser.close();

    const hasPrice =
      extracted.price != null && !Number.isNaN(extracted.price);
    if (!hasPrice) {
      throw new Error("Could not read cocoa price from page");
    }

    let chartSeries = extracted.chartSeries;
    if (!chartSeries || chartSeries.length < 4) {
      chartSeries = syntheticSeries(14);
    }

    return {
      ok: true,
      source: "tradingeconomics.com",
      scrapedAt: new Date().toISOString(),
      error: null,
      price: extracted.price,
      unit: "USD/MT",
      dayChange: extracted.dayChange,
      dayChangePct: extracted.dayChangePct,
      monthChangePct: extracted.monthChangePct,
      yearChangePct: extracted.yearChangePct,
      previousClose: extracted.previousClose,
      yearHigh: extracted.yearHigh,
      yearLow: extracted.yearLow,
      forecastEndQuarter: extracted.forecastEndQuarter,
      forecast12m: extracted.forecast12m,
      headline: extracted.headline || `Cocoa — ${extracted.price} USD/MT`,
      chartSeries,
      news:
        extracted.news && extracted.news.length
          ? extracted.news
          : fallbackPayload().news,
    };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/api/cocoa", async (req, res) => {
  if (
    cache.payload &&
    Date.now() - cache.at < CACHE_MS &&
    req.query.refresh !== "1"
  ) {
    return res.json({ ...cache.payload, cached: true });
  }
  try {
    const payload = await scrapeTradingEconomics();
    cache = { payload, at: Date.now() };
    res.json({ ...payload, cached: false });
  } catch (err) {
    const payload = fallbackPayload(err.message || String(err));
    cache = { payload, at: Date.now() };
    res.json({ ...payload, cached: false });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`OGBO Cocoa app at http://localhost:${PORT}`);
});
