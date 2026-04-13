// // Pre-fetch chart data on DOM ready - before full app initialization
// async function initChartPreload() {
//   if (document.body.dataset.page !== "dashboard") return;
//   try {
//     const r = await fetch("/api/cocoa?t=" + Date.now());
//     const d = await r.json();
//     // Store for later use by main app
//     window.__PRELOADED_COCOA_DATA__ = d;
//   } catch (e) {
//     console.warn("Preload failed:", e);
//   }
// }

// Start preload immediately
// initChartPreload();

(function () {
  const navToggle = document.querySelector(".nav-toggle");
  const navList = document.querySelector(".nav-list");
  if (navToggle && navList) {
    navToggle.addEventListener("click", () => {
      navList.classList.toggle("open");
    });
    navList.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => navList.classList.remove("open"));
    });
  }

  const page = document.body.dataset.page;

  if (page === "contact") {
    const form = document.getElementById("contact-form");
    const toast = document.getElementById("form-toast");
    if (form && toast) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        toast.classList.add("show");
        form.reset();
        setTimeout(() => toast.classList.remove("show"), 5000);
      });
    }
  }

  if (page !== "dashboard") return;

  const els = {
    price: document.getElementById("live-price"),
    unit: document.getElementById("live-unit"),
    change: document.getElementById("live-change"),
    metaPrev: document.getElementById("meta-prev"),
    metaMonth: document.getElementById("meta-month"),
    metaHigh: document.getElementById("meta-high"),
    metaLow: document.getElementById("meta-low"),
    metaFq: document.getElementById("meta-fq"),
    meta12: document.getElementById("meta-12m"),
    source: document.getElementById("data-source"),
    ticker: document.getElementById("ticker-inner"),
    headline: document.getElementById("te-headline"),
    chartStrip: document.getElementById("chart-live-strip"),
  };

  let chartInstance = null;
  let dataLoaded = false;

  function hideSkeletons() {
    if (dataLoaded) return;
    dataLoaded = true;
    const skels = document.querySelectorAll('.skeleton');
    skels.forEach(el => {
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    });
  }

  function hideChartLoader() {
    const overlay = document.getElementById('chartLoader');
    const wrap = document.getElementById('chartWrap');
    if (overlay) overlay.remove();
    if (wrap) wrap.classList.remove('is-loading');
  }

  function fmtMoney(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const v = Number(n);
    const sign = v > 0 ? "+" : "";
    return sign + v.toFixed(2) + "%";
  }

  function renderChart(series) {
    const canvas = document.getElementById("cocoa-chart-main");
    if (!canvas || !window.Chart) return;
    hideChartLoader();
    const ctx = canvas.getContext("2d");
    const labels = series.map((p) => {
      const d = new Date(p[0]);
      return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    });
    const data = series.map((p) => p[1]);

    if (chartInstance) chartInstance.destroy();

    const teBlue = "#2563eb";
    const grid = "rgba(148, 163, 184, 0.12)";

    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Cocoa (USD/T)",
            data,
            borderColor: teBlue,
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            fill: true,
            tension: 0.15,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: { color: "#94a3b8", font: { size: 12, family: "Inter, system-ui, sans-serif" } },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            titleColor: "#e2e8f0",
            bodyColor: "#93c5fd",
            borderColor: "rgba(37, 99, 235, 0.4)",
            borderWidth: 1,
            callbacks: {
              label(ctx) {
                const v = ctx.parsed.y;
                if (v == null) return "";
                return (
                  " " +
                  Number(v).toLocaleString("en-US", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }) +
                  " USD/T"
                );
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#94a3b8",
              maxTicksLimit: 12,
              font: { size: 11 },
            },
            grid: { color: grid },
            border: { color: grid },
          },
          y: {
            position: "right",
            ticks: {
              color: "#94a3b8",
              font: { size: 11 },
              callback(v) {
                return Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
              },
            },
            grid: { color: grid },
            border: { color: grid },
          },
        },
      },
    });
  }

  function buildTicker(news, headline) {
    if (!els.ticker) return;
    const parts = [];
    if (headline) parts.push(`<span class="ticker-item"><strong>TE</strong> — ${headline.slice(0, 180)}</span>`);
    (news || []).forEach((n) => {
      parts.push(`<span class="ticker-item"><strong>News</strong> — ${n}</span>`);
    });
    parts.push(
      `<span class="ticker-item"><strong>ICE</strong> — London cocoa screen active; watch certified stocks.</span>`,
      `<span class="ticker-item"><strong>West Africa</strong> — Mid-crop outlook closely watched by trade.</span>`
    );
    const html = parts.join("") + parts.join("");
    els.ticker.innerHTML = html;
  }

  async function refreshCocoa() {
    try {
      // Use preloaded data if available, otherwise fetch
      // let d;
      // if (window.__PRELOADED_COCOA_DATA__) {
      //   d = window.__PRELOADED_COCOA_DATA__;
      //   delete window.__PRELOADED_COCOA_DATA__; // Use once
      // } else {
        const r = await fetch("/api/cocoa?t=" + Date.now());
       const  d = await r.json();
      // }

      hideSkeletons();
      if (els.price) els.price.textContent = fmtMoney(d.price);
      if (els.unit) els.unit.textContent = d.unit || "USD/MT";
      if (els.change) {
        const pct = d.dayChangePct;
        const up = pct == null || pct >= 0;
        els.change.className = "change-pill " + (up ? "up" : "down");
        els.change.innerHTML =
          `<span class="live-dot" aria-hidden="true"></span>` +
          (pct != null ? fmtPct(pct) + " day" : "—");
      }
      if (els.metaPrev) els.metaPrev.textContent = fmtMoney(d.previousClose);
      if (els.metaMonth) els.metaMonth.textContent = fmtPct(d.monthChangePct);
      if (els.metaHigh) els.metaHigh.textContent = fmtMoney(d.yearHigh);
      if (els.metaLow) els.metaLow.textContent = fmtMoney(d.yearLow);
      if (els.metaFq) els.metaFq.textContent = fmtMoney(d.forecastEndQuarter);
      if (els.meta12) els.meta12.textContent = fmtMoney(d.forecast12m);
      if (els.headline) els.headline.textContent = d.headline || "";

      if (els.chartStrip) {
        const p = d.price;
        const dc = d.dayChange;
        const pct = d.dayChangePct;
        let line = "—";
        if (p != null && !Number.isNaN(Number(p))) {
          const priceStr =
            Number(p).toLocaleString("en-US", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }) + " USD/T";
          if (dc != null && !Number.isNaN(Number(dc)) && pct != null) {
            const sign = Number(dc) >= 0 ? "+" : "";
            line = `${priceStr}  ${sign}${fmtMoney(dc)} (${fmtPct(pct)})`;
          } else {
            line = priceStr;
          }
        }
        els.chartStrip.textContent = line;
      }

      const src =
        d.source === "tradingeconomics.com"
          ? "Trading Economics (live scrape)" + (d.cached ? " · cached" : "")
          : "Fallback / simulated" + (d.error ? " — " + d.error : "");
      if (els.source) els.source.textContent = src;

      if (d.chartSeries && d.chartSeries.length) {
        renderChart(d.chartSeries);
      }
      buildTicker(d.news, d.headline);
    } catch (e) {
      if (els.source) els.source.textContent = "Could not load — " + e.message;
    }
  }

  refreshCocoa();
  setInterval(refreshCocoa, 30000);
})();
