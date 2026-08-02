/**
 * Shopify App Store assets — 5 listing screenshots (1200x900, 2x = 2400x1800)
 * + app icon (1024x1024).
 * Run: node shots-appstore.js
 */
const { chromium } = require("playwright");
const path = require("path");

const SRC = path.join(__dirname, "appstore");
const OUT = path.join(__dirname, "../../docs/appstore-assets");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Users/36177/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe",
  });

  // App icon — 1024x1024, 1x
  const iconCtx = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const iconPage = await iconCtx.newPage();
  await iconPage.goto("file://" + path.join(SRC, "icon.html"));
  await iconPage.waitForTimeout(300);
  await iconPage.screenshot({ path: path.join(OUT, "app-icon-1024.png") });
  console.log("app-icon-1024.png (1024x1024)");
  await iconCtx.close();

  // 5 listing screenshots — 1200x900 at 2x = 2400x1800
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shots = [
    ["shot1-studio.html", "screenshot-1.png", "AI Studio"],
    ["shot2-review.html", "screenshot-2.png", "Schema review"],
    ["shot3-batch.html", "screenshot-3.png", "Batch templates"],
    ["shot4-monitoring.html", "screenshot-4.png", "AI monitoring"],
    ["shot5-product.html", "screenshot-5.png", "Product page"],
  ];
  for (const [file, out, label] of shots) {
    await page.goto("file://" + path.join(SRC, file));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, out) });
    console.log(`${out} (2400x1800) — ${label}`);
  }
  await ctx.close();
  await browser.close();
  console.log("DONE");
})().catch(e => { console.error(e); process.exit(1); });
