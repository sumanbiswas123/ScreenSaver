/**
 * Preload Script - Injected into external websites
 * Handles Ctrl+Shift+S screenshot capture
 */

(function () {
  "use strict";

  console.log("[Screenshot Taker] Capture script loaded");

  // Wait for Neutralino to be available
  function waitForNeutralino(callback, maxAttempts = 50) {
    let attempts = 0;
    const check = () => {
      attempts++;
      if (typeof Neutralino !== "undefined") {
        console.log("[Screenshot Taker] Neutralino detected");
        callback();
      } else if (attempts < maxAttempts) {
        setTimeout(check, 100);
      } else {
        console.error(
          "[Screenshot Taker] Neutralino not available after",
          maxAttempts,
          "attempts"
        );
      }
    };
    check();
  }

  waitForNeutralino(() => {
    Neutralino.init();

    // Listen for keyboard shortcut
    document.addEventListener("keydown", async (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        console.log("[Screenshot Taker] Capture triggered");
        await captureScreenshot();
      }
    });

    console.log("[Screenshot Taker] Ready! Press Ctrl+Shift+S to capture.");

    // Show floating indicator
    showIndicator();
  });

  async function captureScreenshot() {
    try {
      const timestamp = Date.now();
      const filename = "screenshot_" + timestamp + ".png";
      const tempDir = NL_PATH + "/.tmp";

      // Ensure directory exists
      try {
        await Neutralino.filesystem.createDirectory(tempDir);
      } catch (e) {}

      const filePath = tempDir + "/" + filename;

      // Capture the window
      await Neutralino.window.snapshot(filePath);

      console.log("[Screenshot Taker] Screenshot saved:", filePath);

      // Store in shared storage
      try {
        let screenshots = [];
        try {
          const data = await Neutralino.storage.getData("screenshots");
          screenshots = JSON.parse(data) || [];
        } catch (e) {}

        screenshots.push({
          id: timestamp,
          url: window.location.href,
          filename: filename,
          timestamp: new Date().toLocaleString(),
          tempPath: filePath,
        });

        await Neutralino.storage.setData(
          "screenshots",
          JSON.stringify(screenshots)
        );
      } catch (e) {
        console.error("[Screenshot Taker] Storage error:", e);
      }

      // Show success notification
      showNotification("Screenshot captured!", "success");
    } catch (error) {
      console.error("[Screenshot Taker] Error:", error);
      showNotification("Failed: " + error.message, "error");
    }
  }

  function showIndicator() {
    const indicator = document.createElement("div");
    indicator.id = "ss-indicator";
    indicator.innerHTML = "📷 Ctrl+Shift+S to capture";
    indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-family: -apple-system, system-ui, sans-serif;
            font-size: 13px;
            font-weight: 500;
            z-index: 999999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: opacity 0.3s, transform 0.3s;
        `;

    indicator.addEventListener("click", captureScreenshot);
    indicator.addEventListener("mouseenter", () => {
      indicator.style.transform = "scale(1.05)";
    });
    indicator.addEventListener("mouseleave", () => {
      indicator.style.transform = "scale(1)";
    });

    document.body.appendChild(indicator);

    // Auto-hide after 5 seconds, show on hover near top-right
    setTimeout(() => {
      indicator.style.opacity = "0.3";
    }, 5000);

    indicator.addEventListener("mouseenter", () => {
      indicator.style.opacity = "1";
    });
    indicator.addEventListener("mouseleave", () => {
      indicator.style.opacity = "0.3";
    });
  }

  function showNotification(message, type) {
    const existing = document.getElementById("ss-notification");
    if (existing) existing.remove();

    const notification = document.createElement("div");
    notification.id = "ss-notification";
    notification.textContent = message;
    notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === "success" ? "#10b981" : "#ef4444"};
            color: white;
            padding: 14px 24px;
            border-radius: 10px;
            font-family: -apple-system, system-ui, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 999999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;

    // Add animation style
    if (!document.getElementById("ss-styles")) {
      const style = document.createElement("style");
      style.id = "ss-styles";
      style.textContent = `
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = "slideIn 0.3s ease reverse";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
})();
