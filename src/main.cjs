const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

const JOB_DURATION_MS = 30_000;
const JOB_REWARD = 10;
const ENERGY_DRAIN_PER_MINUTE = 1;
const TICK_MS = 100;

let petWindow;
let managementWindow;
let tickHandle;

const state = {
  petName: 'Bob',
  energy: 100,
  money: 0,
  job: null
};

function publicState() {
  const now = Date.now();
  const job = state.job;
  const elapsedMs = job ? Math.min(now - job.startedAt, JOB_DURATION_MS) : 0;
  return {
    petName: state.petName,
    energy: Number(state.energy.toFixed(3)),
    money: Number(state.money.toFixed(2)),
    job: job ? {
      durationMs: JOB_DURATION_MS,
      elapsedMs,
      remainingMs: Math.max(0, JOB_DURATION_MS - elapsedMs),
      reward: JOB_REWARD
    } : null
  };
}

function broadcast() {
  const snapshot = publicState();
  for (const win of [petWindow, managementWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('state:changed', snapshot);
  }
}

function settleJob(reason) {
  if (!state.job) return publicState();
  const elapsedMs = Math.min(Date.now() - state.job.startedAt, JOB_DURATION_MS);
  const fraction = Math.max(0, Math.min(1, elapsedMs / JOB_DURATION_MS));
  state.money = Math.round((state.money + JOB_REWARD * fraction) * 100) / 100;
  state.job = null;
  stopTicker();
  broadcast();
  return { ...publicState(), settlementReason: reason };
}

function tick() {
  if (!state.job) return;
  const now = Date.now();
  const deltaMinutes = (now - state.job.lastTickAt) / 60_000;
  state.job.lastTickAt = now;
  state.energy = Math.max(0, state.energy - ENERGY_DRAIN_PER_MINUTE * deltaMinutes);

  if (state.energy <= 0) {
    settleJob('energy-depleted');
    return;
  }
  if (now - state.job.startedAt >= JOB_DURATION_MS) {
    settleJob('completed');
    return;
  }
  broadcast();
}

function startTicker() {
  stopTicker();
  tickHandle = setInterval(tick, TICK_MS);
}

function stopTicker() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = undefined;
}

function pageUrl(page) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  return devUrl ? `${devUrl}/${page}` : `file://${path.join(__dirname, '..', 'dist', page)}`;
}

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  petWindow = new BrowserWindow({
    width: 260,
    height: 300,
    x: Math.max(0, width - 300),
    y: Math.max(0, height - 340),
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.loadURL(pageUrl('index.html'));
  petWindow.on('closed', () => { petWindow = undefined; });
}

function openManagement() {
  if (managementWindow && !managementWindow.isDestroyed()) {
    managementWindow.show();
    managementWindow.focus();
    return;
  }
  managementWindow = new BrowserWindow({
    width: 360,
    height: 260,
    title: 'Desktop Pet Management',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  managementWindow.removeMenu();
  managementWindow.loadURL(pageUrl('management.html'));
  managementWindow.on('closed', () => { managementWindow = undefined; });
}

app.whenReady().then(() => {
  createPetWindow();
  app.on('activate', () => { if (!petWindow) createPetWindow(); });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', stopTicker);

ipcMain.handle('state:get', () => publicState());
ipcMain.handle('management:open', () => { openManagement(); return true; });
ipcMain.handle('job:start', () => {
  if (!state.job && state.energy > 0) {
    const now = Date.now();
    state.job = { startedAt: now, lastTickAt: now };
    startTicker();
    broadcast();
  }
  return publicState();
});
ipcMain.handle('job:cancel', () => settleJob('cancelled'));
ipcMain.handle('test:set-energy-near-zero', () => {
  state.energy = 0.05;
  broadcast();
  return publicState();
});
ipcMain.handle('window:move-by', (_event, { dx, dy }) => {
  if (!petWindow || petWindow.isDestroyed()) return false;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
  return true;
});
