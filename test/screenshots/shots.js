/**
 * ProdRank plugin screenshots for wordpress.org submission.
 * Captures: admin ProdRank SEO page, product page, JSON-LD source,
 * product list. Run: node shots.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:8081";
const OUT = "../../wordpress-plugin/";

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Users/36177/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe",
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // 1. Login to wp-admin
  await page.goto(`${BASE}/wp-login.php`, { waitUntil: "networkidle" });
  await page.fill("#user_login", "admin");
  await page.fill("#user_pass", "admin");
  await page.click("#wp-submit");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // 2. ProdRank SEO admin page (main feature shot)
  await page.goto(`${BASE}/wp-admin/admin.php?page=prodrank-seo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + "screenshot-1.png", fullPage: true });
  console.log("screenshot-1: ProdRank SEO admin page");

  // 3. Product page (frontend)
  await page.goto(`${BASE}/product/test-canvas-backpack/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + "screenshot-2.png", fullPage: true });
  console.log("screenshot-2: product page");

  // 4. JSON-LD source view (schema output)
  await page.goto(`view-source:${BASE}/product/test-canvas-backpack/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + "screenshot-3.png", fullPage: false });
  console.log("screenshot-3: JSON-LD source");

  // 5. Products list (WooCommerce admin)
  await page.goto(`${BASE}/wp-admin/edit.php?post_type=product`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + "screenshot-4.png", fullPage: true });
  console.log("screenshot-4: product list");

  // 6. Settings page with rendering rules
  await page.goto(`${BASE}/wp-admin/admin.php?page=prodrank-seo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + "screenshot-5.png", fullPage: false });
  console.log("screenshot-5: rendering rules section");

  await browser.close();
  console.log("DONE");
})().catch(e => { console.error(e); process.exit(1); });
