const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Config
const url = process.argv[2];
const sessionDataDir = path.join(
  __dirname,
  "..",
  ".storage",
  "browser_session",
);
const tempDir = path.join(__dirname, "..", ".tmp");

// Ensure dirs exist
if (!fs.existsSync(sessionDataDir))
  fs.mkdirSync(sessionDataDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

(async () => {
  console.log("STARTING_BROWSER");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null, // Allow window resizing
      userDataDir: sessionDataDir, // PERSIST LOGIN!
      args: [
        "--start-maximized",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-infobars",
        "--hide-scrollbars",
      ],
      ignoreDefaultArgs: ["--enable-automation"], // Hides "Chrome is being controlled..." bar
    });

    const pages = await browser.pages();
    const page = pages[0];

    // Navigate
    if (url) {
      console.log("NAVIGATING");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 0 });
      } catch (navErr) {
        console.error("NAV_ERROR:" + navErr.message);
        // Do NOT exit, keep browser open so user can fix URL or login
      }
    }

    console.log("BROWSER_READY");

    // Setup Command Listener
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const debugLog = (msg) => {
      try {
        fs.appendFileSync(path.join(tempDir, "debug_log.txt"), msg + "\n");
      } catch (e) {}
    };

    rl.on("line", async (line) => {
      const cmd = line.trim();
      if (cmd === "CAPTURE") {
        try {
          console.log("CAPTURING");
          const timestamp = Date.now();
          const filename = `capture_${timestamp}.png`;
          const filepath = path.join(tempDir, filename);

          // Bring to front (hacky but tries to ensure it's active)
          // await page.bringToFront();

          // Hide scrollbars aggressively to prevent right-side gap
          await page.addStyleTag({
            content: `
              body { overflow-y: visible !important; } 
              ::-webkit-scrollbar { width: 0px !important; height: 0px !important; background: transparent !important; display: none !important; }
          `,
          });

          // Wait for layout update
          await new Promise((r) => setTimeout(r, 100));

          await page.screenshot({
            path: filepath,
            fullPage: true,
          });

          console.log(`CAPTURE_SUCCESS:${filepath}`);
        } catch (err) {
          console.error(`CAPTURE_ERROR:${err.message}`);
        }
      } else if (cmd.startsWith("GOTO:")) {
        const newUrl = cmd.substring(5);
        try {
          await page.goto(newUrl, {
            waitUntil: "domcontentloaded",
            timeout: 0,
          });
          console.log("NAVIGATED");
        } catch (e) {
          console.error("NAV_ERROR");
        }
      } else if (cmd === "CAPTURE_MOBILE") {
        try {
          debugLog("RECEIVED_CMD: CAPTURE_MOBILE");
          console.log("CAPTURING_MOBILE");
          const timestamp = Date.now();
          const filename = `capture_mobile_${timestamp}.png`;
          const filepath = path.join(tempDir, filename);

          // Store current viewport
          const originalViewport = page.viewport();
          debugLog("ORIGINAL_VIEWPORT: " + JSON.stringify(originalViewport));

          // Set mobile viewport
          console.log("SETTING_VIEWPORT: 390x844");

          // Set User Agent
          await page.setUserAgent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          );

          await page.setViewport({
            width: 390,
            height: 844,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 1, // Set to 1 to ensure 390px output width
          });

          // Wait for layout update
          await new Promise((r) => setTimeout(r, 2000));

          const currentViewport = page.viewport();
          console.log(`CURRENT_VIEWPORT: ${JSON.stringify(currentViewport)}`);
          debugLog("MOBILE_VIEWPORT: " + JSON.stringify(currentViewport));

          console.log("TAKING_MOBILE_SCREENSHOT");

          await page.screenshot({
            path: filepath,
            fullPage: true,
          });

          // DO NOT RESTORE VIEWPORT - User wants to see the mobile view
          console.log("KEPT_MOBILE_VIEW");
          debugLog("KEPT_MOBILE_VIEW");

          console.log(`CAPTURE_SUCCESS:${filepath}`);
          debugLog("CAPTURE_SUCCESS: " + filepath);
        } catch (err) {
          console.error(`CAPTURE_ERROR:${err.message}`);
          debugLog("CAPTURE_ERROR: " + err.message);
        }
      } else if (cmd === "EXIT") {
        await browser.close();
        process.exit(0);
      }
    });

    // Handle Browser Close by User
    browser.on("disconnected", () => {
      console.log("BROWSER_CLOSED");
      process.exit(0);
    });
  } catch (err) {
    console.error("FATAL_ERROR:" + err.message);
    process.exit(1);
  }
})();
