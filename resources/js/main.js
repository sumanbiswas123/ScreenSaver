/**
 * Screenshot Taker - Main Application Logic
 * Uses native Windows screenshot capabilities
 */

// ============================================
// State Management
// ============================================

const state = {
  screenshots: [],
  galleryOpen: false,
  selectedIds: new Set(),
  lastSelectedId: null,
};

// ============================================
// DOM Elements
// ============================================

const elements = {};

// ============================================
// Initialization
// ============================================

Neutralino.events.on("windowClose", () => {
  Neutralino.app.exit();
});

// Spawn global hotkey listener
async function startHotkeyListener() {
  try {
    const scriptPath = NL_PATH + "/resources/hotkey_listener.ps1";
    // Convert to Windows path
    const winPath = scriptPath.replace(/\//g, "\\");

    // Pass temp directory to the script
    const tempDir = NL_PATH + "/.tmp";
    try {
      await Neutralino.filesystem.createDirectory(tempDir);
    } catch (e) {}
    const winTempDir = tempDir.replace(/\//g, "\\");

    // Start PowerShell script in background
    const cmd = `powershell -ExecutionPolicy Bypass -File "${winPath}" "${winTempDir}"`;
    const process = await Neutralino.os.spawnProcess(cmd);

    Neutralino.events.on("spawnedProcess", async (evt) => {
      if (evt.detail.id === process.id) {
        if (evt.detail.action === "stdOut") {
          const output = evt.detail.data.trim();

          if (output.includes("HOTKEY_PRESSED")) {
            console.log("Global hotkey detected!");

            if (sessionProcessId) {
              try {
                // Trigger full page capture
                await Neutralino.os.showNotification(
                  "Screenshot Taker",
                  "Capturing Full Page...",
                  "INFO",
                );
                await captureFullPage();
              } catch (e) {
                console.error("Delegation failed", e);
              }
            } else {
              // Notify user to open website first
              await Neutralino.os.showNotification(
                "Screenshot Taker",
                "Please open a website first to take a full page screenshot.",
                "ERROR",
              );
            }
          } else if (output.includes("LISTENER_STARTED")) {
            console.log("Hotkey listener active");
            showToast(
              "Global shortcuts active: Ctrl+Shift+S (Full), Ctrl+Shift+F (Mobile)",
              "success",
            );
          } else if (output.includes("HOTKEY_PRESSED_MOBILE")) {
            console.log("Global mobile hotkey detected!");

            if (sessionProcessId) {
              try {
                // Trigger mobile capture
                await Neutralino.os.showNotification(
                  "Screenshot Taker",
                  "Switching to Mobile View & Capturing...",
                  "INFO",
                );
                await captureMobilePage();
              } catch (e) {
                console.error("Delegation failed", e);
              }
            } else {
              await Neutralino.os.showNotification(
                "Screenshot Taker",
                "Please open a website first to take a mobile screenshot.",
                "ERROR",
              );
            }
          }
        }
      }
    });

    console.log("Hotkey listener started, PID:", process.id);
  } catch (err) {
    console.error("Failed to start hotkey listener:", err);
  }
}

async function processCapturedFile(filePath) {
  try {
    // Read the captured file
    // Note: filePath from PowerShell might have \r\n
    const cleanPath = filePath.replace(/[\r\n]/g, "");

    // Need to convert windows path back to something we can use if needed,
    // but readBinaryFile takes absolute path so it should be fine.

    const fileData = await Neutralino.filesystem.readBinaryFile(cleanPath);
    const base64Data = arrayBufferToBase64(fileData);
    const dataUrl = "data:image/png;base64," + base64Data;

    const timestamp = Date.now();
    const filename = cleanPath.split("\\").pop();

    // Add to gallery
    const screenshot = {
      id: timestamp,
      url: "Global Hotkey",
      dataUrl: dataUrl,
      filename: filename,
      timestamp: new Date().toLocaleString(),
      tempPath: cleanPath,
    };

    state.screenshots.push(screenshot);
    saveScreenshotsToStorage();
    updateGallery();
    updateGalleryCount();
    updateScreenshotCount();

    showToast("Screenshot captured!", "success");
  } catch (e) {
    console.error("Error processing capture:", e);
    showToast("Error saving screenshot", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeElements();
  setupEventListeners();
  setupKeyboardShortcuts();
  loadScreenshotsFromStorage();
  updateUI();

  // Start listener
  setTimeout(startHotkeyListener, 1000);

  // Init Drag Selection
  initSelectionDrag();
});

function initializeElements() {
  elements.urlInput = document.getElementById("urlInput");
  elements.welcomeScreen = document.getElementById("welcomeScreen");
  elements.galleryPanel = document.getElementById("galleryPanel");
  elements.galleryGrid = document.getElementById("galleryGrid");
  elements.galleryCount = document.getElementById("galleryCount");
  elements.statusText = document.getElementById("statusText");
  elements.screenshotCount = document.getElementById("screenshotCount");
  elements.toastContainer = document.getElementById("toastContainer");
  elements.loadingOverlay = document.getElementById("loadingOverlay");
  elements.loadingText = document.getElementById("loadingText");
  elements.loadingText = document.getElementById("loadingText");
  elements.btnOpen = document.getElementById("btnOpen");
  elements.btnCaptureFull = document.getElementById("btnCaptureFull");
  elements.btnCaptureNow = document.getElementById("btnCaptureNow");
  elements.btnGallery = document.getElementById("btnGallery");
  elements.btnExportAll = document.getElementById("btnExportAll");
  elements.btnExportPdf = document.getElementById("btnExportPdf");
  elements.btnClearAll = document.getElementById("btnClearAll");
  elements.btnCloseGallery = document.getElementById("btnCloseGallery");
}

function setupEventListeners() {
  // Open website in default browser
  elements.btnOpen.addEventListener("click", openWebsite);
  elements.urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") openWebsite();
  });

  // Capture
  elements.btnCaptureFull.addEventListener("click", captureFullPage);
  if (elements.btnCaptureNow) {
    elements.btnCaptureNow.addEventListener("click", () =>
      captureScreen(false),
    );
  }

  // Gallery
  elements.btnGallery.addEventListener("click", toggleGallery);
  elements.btnCloseGallery.addEventListener("click", closeGallery);
  elements.btnExportAll.addEventListener("click", exportAll);
  elements.btnExportPdf.addEventListener("click", exportToPdf);
  elements.btnClearAll.addEventListener("click", clearAll);
}

// ... existing setupKeyboardShortcuts ...

// ============================================
// Full Page Capture (Persistent Session)
// ============================================

async function captureFullPage() {
  if (!sessionProcessId) {
    // Step 1: Open Browser
    let url = elements.urlInput.value.trim();
    if (url) {
      if (!url.startsWith("http://") && !url.startsWith("https://"))
        url = "https://" + url;
      startBrowserSession(url);
    } else {
      showToast("Opening browser...", "info");
      startBrowserSession("about:blank");
    }
    return;
  }

  showLoading(true, "Capturing full page via Puppeteer...");

  // Send capture signal to browser session
  try {
    await Neutralino.os.updateSpawnedProcess(
      sessionProcessId,
      "stdIn",
      "CAPTURE\n",
    );
  } catch (e) {
    showLoading(false);
    showToast("Communication error: " + e.message, "error");
    sessionProcessId = null;
    updateCaptureButton(false);
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", async (e) => {
    // Ctrl+Shift+S - Capture Screen
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      await captureScreen();
    }

    // Ctrl+Shift+F - Mobile Capture
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      await captureMobilePage();
    }

    // Escape - Close gallery
    if (e.key === "Escape") {
      closeGallery();
      closePreview();
    }

    // Ctrl+L - Focus URL bar
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      elements.urlInput.focus();
      elements.urlInput.select();
    }

    // Preview Navigation - Arrow Keys
    const modal = document.getElementById("previewModal");
    if (modal) {
      if (e.key === "ArrowLeft") navigatePreview(-1);
      if (e.key === "ArrowRight") navigatePreview(1);
    }
  });
}

// ============================================
// Website Opening
// ============================================

// ============================================
// Browser Session Management
// ============================================

let sessionProcessId = null;

async function openWebsite() {
  // This function is now just a wrapper to start the session or navigate
  captureFullPage();
}

async function startBrowserSession(url) {
  showLoading(true, "Launching Browser Session...");
  updateStatus("Launching dedicated browser...");

  try {
    const scriptPath = NL_PATH + "/resources/browser_session.js";
    const winScriptPath = scriptPath.replace(/\//g, "\\");

    // Command to run node script
    const cmd = `node "${winScriptPath}" "${url}"`;
    console.log("Spawning session:", cmd);

    const process = await Neutralino.os.spawnProcess(cmd);
    sessionProcessId = process.id;

    Neutralino.events.on("spawnedProcess", async (evt) => {
      if (evt.detail.id === process.id) {
        if (evt.detail.action === "stdOut") {
          const output = evt.detail.data.trim();
          console.log("Session Output:", output);

          if (output.includes("BROWSER_READY")) {
            showLoading(false);
            showToast("Browser Ready! Login and do your activity.", "success");
            updateStatus("Browser Connected - Ready to Capture");
            updateCaptureButton(true);
          } else if (output.includes("CAPTURE_SUCCESS:")) {
            const successPath = output.split("CAPTURE_SUCCESS:")[1].trim();
            await processCapturedFile(successPath);
            showLoading(false);
            showToast("Full Page Captured!", "success");
            Neutralino.os.showNotification(
              "Screenshot Taker",
              "Full Page Screenshot Captured Successfully!",
              "INFO",
            );
          }
        } else if (evt.detail.action === "exit") {
          console.log("Session exited");
          if (sessionProcessId === process.id) {
            sessionProcessId = null;
            updateStatus("Browser Closed");
            updateCaptureButton(false);
          }
        }
      }
    });
  } catch (e) {
    showLoading(false);
    console.error("Failed to start session:", e);
    showToast("Start failed: " + e.message, "error");
    updateCaptureButton(false);
  }
}

function updateCaptureButton(isConnected) {
  const btn = elements.btnCaptureFull;
  if (isConnected) {
    btn.querySelector("span").textContent = "Capture Page";
    btn.title = "Click to capture full page of the open browser";
    btn.classList.add("active-session");
  } else {
    btn.querySelector("span").textContent = "Open Webpage";
    btn.title = "Open a dedicated browser for full page capture";
    btn.classList.remove("active-session");
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

Neutralino.init();

// ============================================
// Screenshot Capture using PowerShell
// ============================================

async function captureScreen(isHotkey = false) {
  if (!isHotkey) {
    showLoading(true, "Capturing screen in 2 seconds...");
    updateStatus("Get ready! Capturing in 2 seconds...");

    // Give user 2 seconds to switch to the window they want to capture
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  showLoading(true, "Capturing now...");

  try {
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}.png`;
    const tempDir = NL_PATH + "/.tmp";

    // Ensure temp directory exists
    try {
      await Neutralino.filesystem.createDirectory(tempDir);
    } catch (e) {
      // Directory exists
    }

    const filePath = tempDir + "/" + filename;
    const winPath = filePath.replace(/\//g, "\\");

    // Write PowerShell script to temp file
    // Optimized for speed and DPI awareness
    const psScriptPath = tempDir + "/capture.ps1";
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Enable DPI awareness to get real screen size
$user32 = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();' -Name "Win32" -Namespace Win32 -PassThru
$user32::SetProcessDPIAware()

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$width = $bounds.Width
$height = $bounds.Height

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
$bitmap.Save("${winPath}")
$graphics.Dispose()
$bitmap.Dispose()
`;

    await Neutralino.filesystem.writeFile(psScriptPath, psScript);

    // Execute PowerShell script file
    const winScriptPath = psScriptPath.replace(/\//g, "\\");
    const result = await Neutralino.os.execCommand(
      `powershell -ExecutionPolicy Bypass -File "${winScriptPath}"`,
    );

    if (result.exitCode !== 0) {
      throw new Error(result.stdErr || "PowerShell failed");
    }

    // Read the captured PNG file
    const fileData = await Neutralino.filesystem.readBinaryFile(filePath);
    const pngBase64 = "data:image/png;base64," + arrayBufferToBase64(fileData);

    // Convert to WebP (High Quality)
    const webpData = await convertImgToWebP(pngBase64);

    // Save WebP file
    const webpFilename = `screenshot_${timestamp}.webp`;
    const webpPath = tempDir + "/" + webpFilename;
    const webpWinPath = webpPath.replace(/\//g, "\\");

    // Convert base64 data back to binary for saving
    // webpData is "data:image/webp;base64,..."
    const base64Content = webpData.split(",")[1];
    const webpBinary = base64ToArrayBuffer(base64Content);

    await Neutralino.filesystem.writeBinaryFile(webpPath, webpBinary);

    // Delete original PNG
    try {
      await Neutralino.filesystem.removeFile(filePath);
    } catch (e) {
      console.warn("Could not delete temp png", e);
    }

    // Add to gallery
    const screenshot = {
      id: timestamp,
      url: "Full Screen",
      dataUrl: webpData, // Store WebP for UI
      filename: webpFilename,
      timestamp: new Date().toLocaleString(),
      tempPath: webpPath,
      loaded: true, // It's in memory now
    };

    state.screenshots.push(screenshot);
    saveScreenshotsToStorage();
    updateGallery();
    updateGalleryCount();
    updateScreenshotCount();

    showLoading(false);
    showToast("Screenshot captured!", "success");
    updateStatus("Screenshot saved to gallery");
  } catch (error) {
    showLoading(false);
    console.error("Screenshot error:", error);
    showToast("Failed to capture: " + error.message, "error");
    updateStatus("Screenshot failed - " + error.message);
  }
}

// ============================================
// Storage Functions
// ============================================

async function saveScreenshotsToStorage() {
  try {
    const metadata = state.screenshots.map((s) => ({
      id: s.id,
      url: s.url,
      filename: s.filename,
      timestamp: s.timestamp,
      tempPath: s.tempPath,
    }));
    await Neutralino.storage.setData("screenshots", JSON.stringify(metadata));
  } catch (e) {
    console.error("Failed to save to storage:", e);
  }
}

async function loadScreenshotsFromStorage() {
  try {
    const data = await Neutralino.storage.getData("screenshots");
    if (data) {
      const metadata = JSON.parse(data);
      console.log(`Found ${metadata.length} screenshots in storage metadata.`);

      let loadedCount = 0;
      let errorCount = 0;

      for (const meta of metadata) {
        try {
          const fileData = await Neutralino.filesystem.readBinaryFile(
            meta.tempPath,
          );
          const base64Data = arrayBufferToBase64(fileData);
          state.screenshots.push({
            ...meta,
            dataUrl: "data:image/png;base64," + base64Data,
          });
          loadedCount++;
        } catch (e) {
          console.error("Could not load screenshot:", meta.filename, e);
          errorCount++;
        }
      }

      console.log(
        `Loaded ${loadedCount} screenshots successfully. Failed: ${errorCount}`,
      );

      if (errorCount > 0) {
        showToast(
          `Warning: ${errorCount} screenshots could not be loaded (files missing).`,
          "error",
        );
      }

      if (metadata.length !== loadedCount + errorCount) {
        console.warn("Mismatch in processing counts?");
      }

      updateGalleryCount();
      updateScreenshotCount();
    }
  } catch (e) {
    // No saved data
    console.log("No saved screenshots found or storage error:", e);
  }
}

// ============================================
// Helper Functions
// ============================================

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function updateScreenshotCount() {
  const count = state.screenshots.length;
  elements.screenshotCount.textContent =
    count + " screenshot" + (count !== 1 ? "s" : "");
}

// ============================================
// Gallery Functions
// ============================================

function toggleGallery() {
  state.galleryOpen = !state.galleryOpen;
  if (state.galleryOpen) {
    openGallery();
  } else {
    closeGallery();
  }
}

function openGallery() {
  state.galleryOpen = true;
  elements.galleryPanel.classList.remove("hidden");
  elements.welcomeScreen.style.display = "none";
  updateGallery();
}

function closeGallery() {
  state.galleryOpen = false;
  elements.galleryPanel.classList.add("hidden");
  elements.welcomeScreen.style.display = "flex";
}

function updateGallery() {
  const hasScreenshots = state.screenshots.length > 0;

  elements.btnExportAll.disabled = !hasScreenshots;
  elements.btnExportPdf.disabled = !hasScreenshots;
  elements.btnClearAll.disabled = !hasScreenshots;

  if (!hasScreenshots) {
    elements.galleryGrid.innerHTML = `
      <div class="empty-gallery">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <p>No screenshots yet</p>
        <span>Click "Capture Screen" to take a screenshot</span>
      </div>
    `;
    return;
  }

  // Placeholder SVG
  const placeholder =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 200' fill='%23f0f0f0'%3E%3Crect width='300' height='200' /%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E";

  elements.galleryGrid.innerHTML = state.screenshots
    .map((screenshot, index) => {
      const imgSrc = screenshot.dataUrl ? screenshot.dataUrl : placeholder;
      const isLoaded = !!screenshot.dataUrl;

      return `
      <div class="screenshot-card ${
        state.selectedIds.has(screenshot.id) ? "selected" : ""
      }" 
           draggable="true" 
           data-id="${screenshot.id}"
           data-loaded="${isLoaded}"
           ondragstart="handleDragStart(event)"
           ondragover="handleDragOver(event)"
           ondragleave="handleDragLeave(event)"
           ondrop="handleDrop(event)">
        
        <div class="select-checkbox-wrapper">
            <input type="checkbox" class="select-checkbox" 
                   ${state.selectedIds.has(screenshot.id) ? "checked" : ""} 
                   onclick="event.stopPropagation(); toggleSelection(${
                     screenshot.id
                   }, event)">
        </div>

        <div class="screenshot-thumb" onclick="previewScreenshot(${
          screenshot.id
        })">
          <div class="screenshot-number">#${index + 1}</div>
          <button class="thumb-delete-btn" onclick="event.stopPropagation(); deleteScreenshot(${
            screenshot.id
          })" title="Delete Image">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
          <img src="${imgSrc}" class="thumb-img" alt="Screenshot" loading="lazy">
        </div>
        <div class="screenshot-info">
          <div class="screenshot-meta">
            <span class="screenshot-url">${screenshot.url}</span>
            <span class="screenshot-time">${screenshot.timestamp}</span>
          </div>
          <div class="screenshot-actions">
            <button class="card-btn" onclick="downloadScreenshot(${
              screenshot.id
            })" title="Download">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button class="card-btn delete" onclick="deleteScreenshot(${
              screenshot.id
            })" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  // Start Lazy Observor
  initLazyLoader();
}

// Drag and Drop Logic
let draggedItem = null;

window.handleDragStart = function (e) {
  draggedItem = e.currentTarget;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
  e.currentTarget.classList.add("dragging");
};

window.handleDragOver = function (e) {
  e.preventDefault(); // Necessary for allow drop
  e.dataTransfer.dropEffect = "move";

  const card = e.target.closest(".screenshot-card");
  if (card && card !== draggedItem) {
    card.style.transform = "scale(1.02)";
    card.style.borderColor = "var(--accent-primary)";
  }
};

window.handleDragLeave = function (e) {
  const card = e.target.closest(".screenshot-card");
  if (card) {
    card.style.transform = "";
    card.style.borderColor = "";
  }
};

window.handleDrop = function (e) {
  e.stopPropagation();
  e.preventDefault(); // return false;

  const targetCard = e.target.closest(".screenshot-card");

  if (draggedItem && targetCard && draggedItem !== targetCard) {
    const draggedId = parseInt(draggedItem.dataset.id);
    const targetId = parseInt(targetCard.dataset.id);

    const fromIndex = state.screenshots.findIndex((s) => s.id === draggedId);
    const toIndex = state.screenshots.findIndex((s) => s.id === targetId);

    if (fromIndex > -1 && toIndex > -1) {
      // Move item in array
      const item = state.screenshots.splice(fromIndex, 1)[0];
      state.screenshots.splice(toIndex, 0, item);

      // Save and Update
      saveScreenshotsToStorage();
      updateGallery();
    }
  }

  if (draggedItem) {
    draggedItem.classList.remove("dragging");
    draggedItem = null;
  }

  // Cleanup styles
  const cards = document.querySelectorAll(".screenshot-card");
  cards.forEach((c) => {
    c.style.transform = "";
    c.style.borderColor = "";
  });
};

function updateGalleryCount() {
  const count = state.screenshots.length;
  elements.galleryCount.textContent = count;
  elements.galleryCount.style.display = count > 0 ? "inline-flex" : "none";
}

// Global functions for onclick handlers
window.previewScreenshot = function (id) {
  const screenshot = state.screenshots.find((s) => s.id === id);
  if (!screenshot) return;

  const index = state.screenshots.findIndex((s) => s.id === id);
  const total = state.screenshots.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const modal = document.createElement("div");
  modal.className = "preview-modal";
  modal.id = "previewModal";
  modal.innerHTML = `
      <button class="preview-close" onclick="closePreview()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

    <div class="preview-content">

      <button class="preview-nav-btn prev ${
        hasPrev ? "" : "hidden"
      }" onclick="event.stopPropagation(); navigatePreview(-1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <button class="preview-nav-btn next ${
        hasNext ? "" : "hidden"
      }" onclick="event.stopPropagation(); navigatePreview(1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <div class="preview-image-wrapper">
          <img id="previewImage" src="${
            screenshot.dataUrl
          }" alt="Screenshot Preview">
      </div>
      
      <div class="preview-actions" style="margin-top: 15px; display: flex; justify-content: center; gap: 10px;">
         <button id="btnCrop" class="big-capture-btn" style="padding: 10px 20px; font-size: 14px; margin: 0;" onclick="startCrop(${
           screenshot.id
         })">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
             <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
             <line x1="9" y1="3" x2="9" y2="21"/>
             <line x1="15" y1="3" x2="15" y2="21"/>
             <line x1="3" y1="9" x2="21" y2="9"/>
             <line x1="3" y1="15" x2="21" y2="15"/>
           </svg>
           Crop Image
         </button>
      </div>
    </div>
  `;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closePreview();
  });

  document.body.appendChild(modal);

  // Store current ID for navigation
  state.currentPreviewId = id;
  state.isAnimating = false;
};

window.navigatePreview = async function (offset) {
  if (!state.currentPreviewId || state.isAnimating) return;

  const currentIndex = state.screenshots.findIndex(
    (s) => s.id === state.currentPreviewId,
  );
  if (currentIndex === -1) return;

  const newIndex = currentIndex + offset;
  if (newIndex >= 0 && newIndex < state.screenshots.length) {
    const newScreenshot = state.screenshots[newIndex];

    // Ensure loaded
    const dataUrl = await ensureScreenshotLoaded(newScreenshot.id);
    if (!dataUrl) return;

    state.isAnimating = true;
    const oldId = state.currentPreviewId;
    state.currentPreviewId = newScreenshot.id;

    const wrapper = document.querySelector(".preview-image-wrapper");
    const oldImg = document.getElementById("previewImage");

    // Create new image
    const newImg = document.createElement("img");
    newImg.src = dataUrl;
    newImg.id = "previewImageNew"; // temp id

    // Determine classes based on direction
    const dir = offset > 0 ? "next" : "prev";

    newImg.classList.add(`slide-${dir}-enter`);
    oldImg.classList.add(`slide-${dir}-exit`);

    wrapper.appendChild(newImg);

    // Force reflow
    void newImg.offsetWidth;

    // Trigger transition
    newImg.classList.add(`slide-${dir}-enter-active`);
    oldImg.classList.add(`slide-${dir}-exit-active`);

    // Update helper controls immediately
    updateNavButtons(newIndex, state.screenshots.length);
    const btnCrop = document.getElementById("btnCrop");
    if (btnCrop)
      btnCrop.setAttribute("onclick", `startCrop(${newScreenshot.id})`);

    // Cleanup after transition
    setTimeout(() => {
      oldImg.remove();
      newImg.id = "previewImage";
      newImg.className = ""; // remove transition classes
      state.isAnimating = false;
    }, 400); // Match CSS transition duration
  }
};

function updateNavButtons(index, total) {
  const prevBtn = document.querySelector(".preview-nav-btn.prev");
  const nextBtn = document.querySelector(".preview-nav-btn.next");

  if (prevBtn) {
    if (index > 0) prevBtn.classList.remove("hidden");
    else prevBtn.classList.add("hidden");
  }

  if (nextBtn) {
    if (index < total - 1) nextBtn.classList.remove("hidden");
    else nextBtn.classList.add("hidden");
  }
}

window.closePreview = function () {
  const modal = document.getElementById("previewModal");
  if (modal) modal.remove();
};

window.downloadScreenshot = async function (id) {
  const screenshot = state.screenshots.find((s) => s.id === id);
  if (!screenshot) return;

  try {
    const result = await Neutralino.os.showSaveDialog("Save Screenshot", {
      defaultPath: screenshot.filename,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });

    if (result) {
      const base64Data = screenshot.dataUrl.split(",")[1];
      const binaryData = base64ToArrayBuffer(base64Data);
      await Neutralino.filesystem.writeBinaryFile(result, binaryData);
      showToast("Screenshot saved!", "success");
    }
  } catch (error) {
    console.error("Save error:", error);
    showToast("Failed to save screenshot", "error");
  }
};

window.deleteScreenshot = async function (id) {
  const index = state.screenshots.findIndex((s) => s.id === id);
  if (index === -1) return;

  const confirmed = await Neutralino.os.showMessageBox(
    "Confirm Delete",
    "Are you sure you want to delete this screenshot?",
    "YES_NO",
    "QUESTION",
  );
  if (confirmed !== "YES") return;

  const screenshot = state.screenshots[index];

  try {
    await Neutralino.filesystem.removeFile(screenshot.tempPath);
  } catch (e) {
    // File might not exist
  }

  state.screenshots.splice(index, 1);
  saveScreenshotsToStorage();
  updateGallery();
  updateGalleryCount();
  updateScreenshotCount();
  showToast("Screenshot deleted", "success");
};

async function exportAll() {
  if (state.screenshots.length === 0) {
    showToast("No screenshots to export", "error");
    return;
  }

  try {
    const result = await Neutralino.os.showFolderDialog("Select Export Folder");

    if (result) {
      showLoading(true, "Exporting screenshots...");
      updateStatus("Exporting screenshots...");

      let exported = 0;
      for (const screenshot of state.screenshots) {
        try {
          const filePath = result + "/" + screenshot.filename;
          const base64Data = screenshot.dataUrl.split(",")[1];
          const binaryData = base64ToArrayBuffer(base64Data);
          await Neutralino.filesystem.writeBinaryFile(filePath, binaryData);
          exported++;
        } catch (e) {
          console.error("Export error:", e);
        }
      }

      showLoading(false);
      showToast(`Exported ${exported} screenshot(s)!`, "success");
      updateStatus(`Exported ${exported} screenshots`);
    }
  } catch (error) {
    showLoading(false);
    console.error("Export error:", error);
    showToast("Failed to export screenshots", "error");
  }
}

async function clearAll() {
  if (state.screenshots.length === 0) return;

  for (const screenshot of state.screenshots) {
    try {
      await Neutralino.filesystem.removeFile(screenshot.tempPath);
    } catch (e) {
      // Ignore
    }
  }

  state.screenshots = [];
  saveScreenshotsToStorage();
  updateGallery();
  updateGalleryCount();
  updateScreenshotCount();
  showToast("All screenshots cleared", "success");
}

// ============================================
// UI Helper Functions
// ============================================

function updateStatus(text) {
  elements.statusText.textContent = text;
}

function showLoading(show, text = "Loading...") {
  if (show) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove("hidden");
  } else {
    elements.loadingOverlay.classList.add("hidden");
  }
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon =
    type === "success"
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  toast.innerHTML = `${icon}<span class="toast-message">${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function updateUI() {
  updateGalleryCount();
  updateScreenshotCount();
  updateStatus("Ready - Click 'Capture Screen' or press Ctrl+Shift+S");
}

// ============================================
// Crop Functionality
// ============================================

window.toggleSelection = function (id, event) {
  // Fix undefined event if called manually
  if (!event) event = window.event;

  // Shift+Click Range Selection
  if (
    event &&
    event.shiftKey &&
    state.lastSelectedId !== null &&
    state.lastSelectedId !== id
  ) {
    const allIds = state.screenshots.map((s) => s.id);
    const startIdx = allIds.indexOf(state.lastSelectedId);
    const endIdx = allIds.indexOf(id);

    if (startIdx !== -1 && endIdx !== -1) {
      const min = Math.min(startIdx, endIdx);
      const max = Math.max(startIdx, endIdx);

      for (let i = min; i <= max; i++) {
        const currentId = allIds[i];
        state.selectedIds.add(currentId);
        updateCardSelectionState(currentId, true);
      }
    }
  } else {
    // Normal Toggle
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
      updateCardSelectionState(id, false);
    } else {
      state.selectedIds.add(id);
      updateCardSelectionState(id, true);
      state.lastSelectedId = id; // Update last selected only on single select (or let it be last clicked)
    }
  }

  // Always update last clicked for shift reference
  state.lastSelectedId = id;

  // Update crop toolbar text if visible (efficiently)
  updateCropToolbarText();
};

function updateCardSelectionState(id, isSelected) {
  const card = document.querySelector(`.screenshot-card[data-id="${id}"]`);
  if (card) {
    if (isSelected) card.classList.add("selected");
    else card.classList.remove("selected");

    const checkbox = card.querySelector(".select-checkbox");
    if (checkbox) checkbox.checked = isSelected;
  }
}

function updateCropToolbarText() {
  const toolbar = document.querySelector(".crop-toolbar");
  const previewWrapper = document.querySelector(".preview-image-wrapper");
  // Only if crop toolbar is visible (implies we are in crop mode)
  if (toolbar) {
    // We need to know which image is currently being cropped to filter it out from count if needed,
    // but typically we just count all selected.
    // Recalculate text
    const count = state.selectedIds.size;
    const btn = toolbar.querySelector("button:nth-child(2)"); // Apply button
    if (btn) {
      const btnText =
        count > 1 ? `Apply Crop to ${count} Images` : "Apply Crop";
      btn.textContent = btnText;
    }
  }
}

let cropState = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  cropX: 0,
  cropY: 0,
  cropW: 0,
  cropH: 0,
  dragging: null,
  imgElement: null,
  container: null,
  box: null,
};

window.startCrop = async function (id) {
  const screenshot = state.screenshots.find((s) => s.id === id);
  if (!screenshot) return;

  const modalContent = document.querySelector(".preview-content");
  if (!modalContent) return;

  // Clear content but keep close button hidden or recreate it
  // Actually typically we want to replace the image.

  // Easier: Clear specific parts
  // Easier: Clear specific parts
  const previewImg = document.getElementById("previewImage");
  const previewWrapper = document.querySelector(".preview-image-wrapper");
  const previewActions = document.querySelector(".preview-actions");

  // Hide wrapper if it exists (new structure), otherwise hide img (legacy)
  if (previewWrapper) {
    previewWrapper.style.display = "none";
  } else if (previewImg) {
    previewImg.style.display = "none";
  }

  if (previewActions) previewActions.style.display = "none";

  // Create container
  let container = modalContent.querySelector(".crop-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "crop-container";
    // Insert before actions if possible, or just append.
    // Since we hide others, append is fine, but for layout stability let's match wrapper
    modalContent.appendChild(container);
  }
  container.innerHTML = "";
  container.style.display = "block";

  const img = document.createElement("img");
  img.src = screenshot.dataUrl;
  img.style.maxWidth = "100%";
  img.style.maxHeight = "80vh";
  img.style.display = "block";
  // Prevent default drag
  img.ondragstart = (e) => e.preventDefault();

  container.appendChild(img);

  // Wait for image to load to get dimensions
  img.onload = () => {
    const w = img.offsetWidth;
    const h = img.offsetHeight;

    cropState = {
      active: true,
      id: id,
      imgElement: img,
      container: container,
      cropW: w,
      cropH: h,
      cropX: 0,
      cropY: 0,
      dragging: null,
      initialX: 0,
      initialY: 0,
      initialW: 0,
      initialH: 0, // Init
    };

    renderCropOverlay();
    renderToolbar(id);
  };
};

function renderCropOverlay() {
  const existing = cropState.container.querySelector(".crop-overlay-wrapper");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "crop-overlay-wrapper";
  wrapper.style.position = "absolute";
  wrapper.style.top = "0";
  wrapper.style.left = "0";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";

  const box = document.createElement("div");
  box.className = "crop-box";
  box.style.left = cropState.cropX + "px";
  box.style.top = cropState.cropY + "px";
  box.style.width = cropState.cropW + "px";
  box.style.height = cropState.cropH + "px";

  ["nw", "ne", "sw", "se", "n", "s", "w", "e"].forEach((pos) => {
    const handle = document.createElement("div");
    handle.className = `crop-handle handle-${pos}`;
    handle.dataset.handle = pos;
    box.appendChild(handle);
    handle.addEventListener("mousedown", (e) => startDrag(e, pos));
  });

  box.addEventListener("mousedown", (e) => {
    if (e.target === box) startDrag(e, "move");
  });

  wrapper.appendChild(box);
  cropState.container.appendChild(wrapper);
  cropState.box = box;

  if (!cropState.listenersAttached) {
    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", endDrag);
    cropState.listenersAttached = true;
  }
}

function renderToolbar(id) {
  const modalContent = document.querySelector(".preview-content");
  const existingActions = modalContent.querySelector(".crop-toolbar");
  if (existingActions) existingActions.remove();

  const toolbar = document.createElement("div");
  toolbar.className = "crop-toolbar";

  const count = state.selectedIds.has(id) ? state.selectedIds.size : 1;
  const btnText = count > 1 ? `Apply Crop to ${count} Images` : "Apply Crop";

  toolbar.innerHTML = `
        <button class="big-capture-btn" style="background: #ef4444; padding: 10px 20px;" onclick="cancelCrop(${id})">Cancel</button>
        <button class="big-capture-btn" style="padding: 10px 20px;" onclick="applyCrop()">${btnText}</button>
    `;

  modalContent.appendChild(toolbar);
}

function startDrag(e, handle) {
  e.stopPropagation();
  e.preventDefault();
  cropState.dragging = handle;
  cropState.startX = e.clientX;
  cropState.startY = e.clientY;
  cropState.initialX = cropState.cropX;
  cropState.initialY = cropState.cropY;
  cropState.initialW = cropState.cropW;
  cropState.initialH = cropState.cropH;
}

function handleDrag(e) {
  if (!cropState.active || !cropState.dragging) return;

  const dx = e.clientX - cropState.startX;
  const dy = e.clientY - cropState.startY;
  const imgW = cropState.imgElement.offsetWidth;
  const imgH = cropState.imgElement.offsetHeight;

  let newX = cropState.initialX;
  let newY = cropState.initialY;
  let newW = cropState.initialW;
  let newH = cropState.initialH;

  if (cropState.dragging === "move") {
    newX += dx;
    newY += dy;
    // Constrain
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + newW > imgW) newX = imgW - newW;
    if (newY + newH > imgH) newY = imgH - newH;
  } else {
    if (cropState.dragging.includes("e"))
      newW = Math.max(20, cropState.initialW + dx);
    if (cropState.dragging.includes("s"))
      newH = Math.max(20, cropState.initialH + dy);

    if (cropState.dragging.includes("w")) {
      newW = Math.max(20, cropState.initialW - dx);
      newX = cropState.initialX + dx;
      if (newW === 20) newX = cropState.initialX + (cropState.initialW - 20);
    }
    if (cropState.dragging.includes("n")) {
      newH = Math.max(20, cropState.initialH - dy);
      newY = cropState.initialY + dy;
      if (newH === 20) newY = cropState.initialY + (cropState.initialH - 20);
    }
  }

  if (newX < 0) {
    newW += newX;
    newX = 0;
  }
  if (newY < 0) {
    newH += newY;
    newY = 0;
  }
  if (newX + newW > imgW) newW = imgW - newX;
  if (newY + newH > imgH) newH = imgH - newY;

  cropState.cropX = newX;
  cropState.cropY = newY;
  cropState.cropW = newW;
  cropState.cropH = newH;

  cropState.box.style.left = newX + "px";
  cropState.box.style.top = newY + "px";
  cropState.box.style.width = newW + "px";
  cropState.box.style.height = newH + "px";
}

function endDrag() {
  cropState.dragging = null;
}

window.cancelCrop = function (id) {
  cropState.active = false;
  const previewImg = document.getElementById("previewImage");
  const previewWrapper = document.querySelector(".preview-image-wrapper");
  const previewActions = document.querySelector(".preview-actions");
  const container = document.querySelector(".crop-container");
  const toolbar = document.querySelector(".crop-toolbar"); // Remove separate toolbar

  if (previewWrapper) {
    previewWrapper.style.display = "flex";
  } else if (previewImg) {
    previewImg.style.display = "block";
  }

  if (previewActions) previewActions.style.display = "flex";
  if (container) container.style.display = "none";
  if (toolbar) toolbar.remove();
};

window.applyCrop = async function () {
  const imgW = cropState.imgElement.offsetWidth;
  const imgH = cropState.imgElement.offsetHeight;
  const naturalW = cropState.imgElement.naturalWidth;
  const naturalH = cropState.imgElement.naturalHeight;
  const scaleX = naturalW / imgW;
  const scaleY = naturalH / imgH;

  const cropRel = {
    x: cropState.cropX * scaleX,
    y: cropState.cropY * scaleY,
    w: cropState.cropW * scaleX,
    h: cropState.cropH * scaleY,
  };

  // Calculate percentages for other images
  const perX = cropState.cropX / imgW;
  const perY = cropState.cropY / imgH;
  const perW = cropState.cropW / imgW;
  const perH = cropState.cropH / imgH;
  const percentCrop = { x: perX, y: perY, w: perW, h: perH };

  showLoading(true, "Cropping...");

  try {
    await performSingleCrop(cropState.id, cropRel);

    if (state.selectedIds.has(cropState.id) && state.selectedIds.size > 1) {
      const others = Array.from(state.selectedIds).filter(
        (id) => id !== cropState.id,
      );
      for (const otherId of others) {
        await performRelativeCrop(otherId, percentCrop);
      }
    }

    showLoading(false);
    showToast("Cropping complete!", "success");
    window.cancelCrop(cropState.id);

    // Refresh preview image
    const screenshot = state.screenshots.find((s) => s.id === cropState.id);
    const previewImg = document.getElementById("previewImage");
    if (previewImg && screenshot) {
      previewImg.src = screenshot.dataUrl;
    }

    updateGallery();
  } catch (e) {
    showLoading(false);
    console.error(e);
    showToast("Cropping failed: " + e.message, "error");
  }
};

async function performSingleCrop(id, absoluteCrop) {
  const screenshot = state.screenshots.find((s) => s.id === id);
  if (!screenshot) return;
  return new Promise((resolve, reject) => {
    const tempImg = new Image();
    tempImg.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = absoluteCrop.w;
      canvas.height = absoluteCrop.h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        tempImg,
        absoluteCrop.x,
        absoluteCrop.y,
        absoluteCrop.w,
        absoluteCrop.h,
        0,
        0,
        absoluteCrop.w,
        absoluteCrop.h,
      );
      const newDataUrl = canvas.toDataURL("image/png");
      const binaryData = base64ToArrayBuffer(newDataUrl.split(",")[1]);
      await Neutralino.filesystem.writeBinaryFile(
        screenshot.tempPath,
        binaryData,
      );
      screenshot.dataUrl = newDataUrl;
      resolve();
    };
    tempImg.onerror = reject;
    tempImg.src = screenshot.dataUrl;
  });
}

async function performRelativeCrop(id, percentCrop) {
  const screenshot = state.screenshots.find((s) => s.id === id);
  if (!screenshot) return;
  return new Promise((resolve, reject) => {
    const tempImg = new Image();
    tempImg.onload = async () => {
      const w = tempImg.naturalWidth;
      const h = tempImg.naturalHeight;
      const cropX = w * percentCrop.x;
      const cropY = h * percentCrop.y;
      const cropW = w * percentCrop.w;
      const cropH = h * percentCrop.h;

      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(tempImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const newDataUrl = canvas.toDataURL("image/png");
      const binaryData = base64ToArrayBuffer(newDataUrl.split(",")[1]);
      await Neutralino.filesystem.writeBinaryFile(
        screenshot.tempPath,
        binaryData,
      );
      screenshot.dataUrl = newDataUrl;
      resolve();
    };
    tempImg.onerror = reject;
    tempImg.src = screenshot.dataUrl;
  });
}

// ============================================
// Drag Selection Functionality
// ============================================

const selectionState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  box: null,
  initialSelection: new Set(),
};

function initSelectionDrag() {
  const grid = elements.galleryGrid;
  if (!grid) return;

  grid.addEventListener("mousedown", handleSelectionStart);
  document.addEventListener("mousemove", handleSelectionMove); // Document level for smoother drag
  document.addEventListener("mouseup", handleSelectionEnd);
}

function handleSelectionStart(e) {
  // Ignore if clicking on interactive elements (checkbox, button, image thumb itself usually handles click)
  if (
    e.target.closest("button") ||
    e.target.closest("input") ||
    e.target.closest(".crop-overlay")
  )
    return;

  // Also if in crop mode, don't select
  if (cropState && cropState.active) return;

  selectionState.isDragging = true;
  selectionState.startX = e.pageX;
  selectionState.startY = e.pageY;
  selectionState.initialSelection = new Set(state.selectedIds); // Snapshot

  // Create box
  const box = document.createElement("div");
  box.className = "selection-box";
  document.body.appendChild(box);
  selectionState.box = box;

  updateSelectionBox();
}

function handleSelectionMove(e) {
  if (!selectionState.isDragging) return;

  selectionState.currentX = e.pageX;
  selectionState.currentY = e.pageY;

  updateSelectionBox();
  checkSelectionIntersection();
}

function handleSelectionEnd(e) {
  if (!selectionState.isDragging) return;

  selectionState.isDragging = false;

  if (selectionState.box) {
    selectionState.box.remove();
    selectionState.box = null;
  }
}

function updateSelectionBox() {
  if (!selectionState.box) return;

  const left = Math.min(selectionState.startX, selectionState.currentX);
  const top = Math.min(selectionState.startY, selectionState.currentY);
  const width = Math.abs(selectionState.currentX - selectionState.startX);
  const height = Math.abs(selectionState.currentY - selectionState.startY);

  selectionState.box.style.left = left + "px";
  selectionState.box.style.top = top + "px";
  selectionState.box.style.width = width + "px";
  selectionState.box.style.height = height + "px";
  selectionState.box.style.display = "block";
}

function checkSelectionIntersection() {
  if (!selectionState.box) return;

  const boxRect = selectionState.box.getBoundingClientRect();
  const cards = document.querySelectorAll(".screenshot-card");

  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const id = parseInt(card.dataset.id);

    // Simple intersection test
    const intersects = !(
      boxRect.right < cardRect.left ||
      boxRect.left > cardRect.right ||
      boxRect.bottom < cardRect.top ||
      boxRect.top > cardRect.bottom
    );

    if (intersects) {
      // If not already selected, select it
      if (!state.selectedIds.has(id)) {
        state.selectedIds.add(id);
        updateCardSelectionState(id, true);
      }
    } else {
      // Union behavior: Do NOT unselect if it doesn't intersect.
      // Users can clear selection by clicking empty space (if implemented) or unchecking.
    }
  });

  updateCropToolbarText();
}

// ============================================
// PDF Export
// ============================================

async function exportToPdf() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    showToast("PDF Library not loaded", "error");
    return;
  }

  // Decide what to export
  let targets = state.screenshots;
  if (state.selectedIds.size > 0) {
    targets = state.screenshots.filter((s) => state.selectedIds.has(s.id));
  }

  if (targets.length === 0) {
    showToast("No screenshots to export", "error");
    return;
  }

  try {
    showLoading(true, "Generating PDF...");

    // Load first image to initialize document format
    const firstS = targets[0];
    const firstTempImg = new Image();
    firstTempImg.src = firstS.dataUrl;
    await new Promise((r) => (firstTempImg.onload = r));

    // Create Doc with first image size
    const doc = new jsPDF({
      orientation:
        firstTempImg.naturalWidth > firstTempImg.naturalHeight ? "l" : "p",
      unit: "px",
      format: [firstTempImg.naturalWidth, firstTempImg.naturalHeight],
      compress: true,
    });

    // Add first image (covers full page)
    doc.addImage(
      firstS.dataUrl,
      "PNG",
      0,
      0,
      firstTempImg.naturalWidth,
      firstTempImg.naturalHeight,
      undefined,
      "FAST",
    );

    // Loop through remaining images
    for (let i = 1; i < targets.length; i++) {
      // Update loading status for large sets
      if (i % 5 === 0)
        showLoading(true, `Generating PDF... (${i + 1}/${targets.length})`);

      const s = targets[i];
      const tempImg = new Image();
      tempImg.src = s.dataUrl;
      await new Promise((r) => (tempImg.onload = r));

      const imgW = tempImg.naturalWidth;
      const imgH = tempImg.naturalHeight;
      const orientation = imgW > imgH ? "l" : "p";

      // Add new page with specific dimensions of this image
      doc.addPage([imgW, imgH], orientation);

      // Convert to PNG for PDF compatibility (jsPDF support for WebP varies)
      // Since we already loaded it into tempImg (which is an Image element),
      // we can draw it to a canvas and get PNG data.
      const cvs = document.createElement("canvas");
      cvs.width = imgW;
      cvs.height = imgH;
      const ctx = cvs.getContext("2d");
      ctx.drawImage(tempImg, 0, 0);
      const pngData = cvs.toDataURL("image/png");

      doc.addImage(pngData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    }

    showLoading(true, "Saving PDF... (This may take a moment)");

    // Output as array buffer
    const pdfBytes = doc.output("arraybuffer");

    const result = await Neutralino.os.showSaveDialog("Save PDF", {
      defaultPath: "screenshots.pdf",
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (result) {
      // Chunked writing to avoid OOM in neutralino.js
      const chunkSize = 1024 * 512; // 512KB chunks
      const totalBytes = pdfBytes.byteLength;

      // Write first chunk (overwrite)
      const firstChunk = pdfBytes.slice(0, Math.min(chunkSize, totalBytes));
      await Neutralino.filesystem.writeBinaryFile(result, firstChunk);

      // Append rest
      let offset = chunkSize;
      while (offset < totalBytes) {
        const end = Math.min(offset + chunkSize, totalBytes);
        const chunk = pdfBytes.slice(offset, end);
        await Neutralino.filesystem.appendBinaryFile(result, chunk);
        offset += chunkSize;

        // Yield to UI to prevent freezing
        if (offset % (chunkSize * 5) === 0) {
          const progress = Math.round((offset / totalBytes) * 100);
          showLoading(true, `Saving PDF... ${progress}%`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      showToast("PDF Saved successfully", "success");
    }
  } catch (e) {
    console.error(e);
    showToast("PDF Export failed: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

// ============================================
// Lazy Loading System
// ============================================

let galleryObserver = null;

function initLazyLoader() {
  if (galleryObserver) galleryObserver.disconnect();

  const options = {
    root: elements.galleryPanel, // Watch scrolling within gallery panel
    rootMargin: "200px", // Load 200px before visible
    threshold: 0.1,
  };

  galleryObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const card = entry.target;
        const id = parseInt(card.dataset.id);
        const isLoaded = card.dataset.loaded === "true";

        if (!isLoaded) {
          ensureScreenshotLoaded(id).then((dataUrl) => {
            if (dataUrl) {
              const img = card.querySelector(".thumb-img");
              if (img) img.src = dataUrl;
              card.dataset.loaded = "true";
            }
          });
          // Stop observing once triggered
          observer.unobserve(card);
        }
      }
    });
  }, options);

  const cards = document.querySelectorAll(".screenshot-card");
  cards.forEach((card) => {
    if (card.dataset.loaded !== "true") {
      galleryObserver.observe(card);
    }
  });
}

// Ensure a single screenshot is loaded into memory
async function ensureScreenshotLoaded(id) {
  const s = state.screenshots.find((x) => x.id === id);
  if (!s) return null;

  if (s.dataUrl) return s.dataUrl;

  // Load file
  try {
    const fileData = await Neutralino.filesystem.readBinaryFile(s.tempPath);
    const base64Data = arrayBufferToBase64(fileData);
    s.dataUrl = "data:image/png;base64," + base64Data;
    s.loaded = true;
    return s.dataUrl;
  } catch (e) {
    console.error("Failed to lazy load image:", s.filename, e);
    return null;
  }
}

// ============================================
// Image Conversion
// ============================================

function convertImgToWebP(srcBase64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Convert to WebP high quality
      const webp = canvas.toDataURL("image/webp", 0.95);
      resolve(webp);
    };
    img.onerror = reject;
    img.src = srcBase64;
  });
}
