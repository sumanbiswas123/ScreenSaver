const puppeteer = require("puppeteer");
const fs = require("fs");

const url = process.argv[2];
const outputPath = process.argv[3];

if (!url || !outputPath) {
  console.error("Usage: node capture_full.js <url> <output_path>");
  process.exit(1);
}

(async () => {
  console.log("Starting full page capture for:", url);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // Make it visible for login
      defaultViewport: null, // Allow resizing
      args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
    });

    const pages = await browser.pages();
    const page = pages[0]; // Use the first tab

    // Go to URL
    console.log("Navigating...");
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("READY_FOR_LOGIN"); // Signal to main app

    // Wait for "CAPTURE" signal from main app
    await new Promise((resolve) => {
      process.stdin.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg === "CAPTURE") resolve();
      });
    });

    console.log("Taking screenshot...");
    await page.screenshot({
      path: outputPath,
      fullPage: true,
    });

    console.log("CAPTURE_SUCCESS:" + outputPath);
  } catch (e) {
    console.error("CAPTURE_ERROR:" + e.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
