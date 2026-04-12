/**
 * One-off scrape to stdout (requires: npm install && Chromium via Puppeteer).
 * Usage: node scripts/scrape-once.js
 */
const puppeteer = require("puppeteer");

const TE_COCOA = "https://tradingeconomics.com/commodity/cocoa";

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  await page.goto(TE_COCOA, { waitUntil: "networkidle2", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 4000));
  const title = await page.title();
  const snippet = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    return h1 ? h1.innerText.slice(0, 400) : "";
  });
  await browser.close();
  console.log(JSON.stringify({ title, snippet }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
