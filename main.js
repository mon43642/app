const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (e) {
    return {};
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// Decide which adb.exe to use, in priority order:
// 1) a path the user picked manually in Settings (saved to config.json)
// 2) a "platform-tools" folder bundled next to the packaged app
// 3) a "platform-tools" folder next to this file (useful in dev mode)
// 4) just "adb" and hope it's on the system PATH
function resolveAdbPath() {
  const cfg = loadConfig();
  if (cfg.adbPath && fs.existsSync(cfg.adbPath)) return cfg.adbPath;

  const bundled = path.join(process.resourcesPath || "", "platform-tools", "adb.exe");
  if (fs.existsSync(bundled)) return bundled;

  const devBundled = path.join(__dirname, "platform-tools", "adb.exe");
  if (fs.existsSync(devBundled)) return devBundled;

  return "adb";
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    const adbPath = resolveAdbPath();
    execFile(
      adbPath,
      args,
      { maxBuffer: 1024 * 1024 * 25, windowsHide: true, timeout: 30000 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          reject(new Error(stderr && stderr.trim() ? stderr.trim() : err.message));
          return;
        }
        resolve((stdout || "") + (stderr || ""));
      }
    );
  });
}

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    backgroundColor: "#0a0f0c",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------------- IPC handlers ---------------- */

ipcMain.handle("adb:checkBinary", async () => {
  try {
    const out = await runAdb(["version"]);
    return { ok: true, info: out.split("\n")[0].trim(), path: resolveAdbPath() };
  } catch (err) {
    return { ok: false, error: err.message, path: resolveAdbPath() };
  }
});

ipcMain.handle("adb:devices", async () => {
  const out = await runAdb(["devices", "-l"]);
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const devices = [];
  for (const line of lines) {
    if (line.toLowerCase().startsWith("list of devices")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    devices.push({ serial: parts[0], status: parts[1] });
  }
  return devices;
});

ipcMain.handle("adb:shell", async (_e, serial, cmd) => {
  return runAdb(["-s", serial, "shell", cmd]);
});

ipcMain.handle("adb:reboot", async (_e, serial, mode) => {
  const args = ["-s", serial, "reboot"];
  if (mode) args.push(mode);
  try {
    await runAdb(args);
  } catch (err) {
    // device legitimately disconnects mid-reboot, that's expected
  }
  return true;
});

ipcMain.handle("adb:shutdown", async (_e, serial) => {
  try {
    await runAdb(["-s", serial, "shell", "reboot", "-p"]);
  } catch (err) {
    // expected disconnect
  }
  return true;
});

ipcMain.handle("config:get", async () => loadConfig());
ipcMain.handle("config:set", async (_e, cfg) => {
  saveConfig(cfg);
  return true;
});

ipcMain.handle("dialog:pickAdb", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "เลือกไฟล์ adb.exe",
    properties: ["openFile"],
    filters: [{ name: "adb.exe", extensions: ["exe"] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});
