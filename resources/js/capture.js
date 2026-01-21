/**
 * Capture script - Injected into browser windows
 * Handles screenshot capture via Ctrl+Shift+S
 */

// Wait for Neutralino to be ready
if (typeof Neutralino !== "undefined") {
  Neutralino.init();

  document.addEventListener("keydown", async (e) => {
    // Ctrl+Shift+S - Take Screenshot
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      await captureThisWindow();
    }
  });

  async function captureThisWindow() {
    try {
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const filePath = NL_PATH + "/.tmp/" + filename;

      // Ensure temp directory exists
      try {
        await Neutralino.filesystem.createDirectory(NL_PATH + "/.tmp");
      } catch (e) {
        // Directory exists
      }

      // Capture
      await Neutralino.window.snapshot(filePath);

      // Show notification
      alert("Screenshot saved! Check the gallery in main window.");
    } catch (error) {
      console.error("Screenshot error:", error);
      alert("Failed to capture screenshot: " + error.message);
    }
  }
}
