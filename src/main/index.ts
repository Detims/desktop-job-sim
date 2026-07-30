import {
  app,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  ManagementTabSchema,
  PetCommandSchema,
  WindowPointSchema,
  type ManagementTab,
  type PetPatch,
  type WindowPoint,
} from "../shared/contracts.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import { PetController } from "./pet-controller.js";
import {
  calculateInitialPetBounds,
  clampPetBoundsToWorkAreas,
  createPetWindowOptions,
} from "./platform/pet-window.js";

let petWindow: BrowserWindow | null = null;
let managementWindow: BrowserWindow | null = null;
let dragOffset: WindowPoint | null = null;
let scheduler: NodeJS.Timeout | null = null;
let lastTickAt = performance.now();
let simulationPaused = false;
const petController = new PetController(Date.now());

function isPetSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
): boolean {
  return petWindow !== null && event.sender === petWindow.webContents;
}

function isPetStateSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
): boolean {
  return (
    isPetSender(event) ||
    (managementWindow !== null &&
      event.sender === managementWindow.webContents)
  );
}

function publishPatch(patch: PetPatch): void {
  if (petWindow !== null && !petWindow.isDestroyed()) {
    petWindow.webContents.send(IPC_CHANNELS.patch, patch);
  }

  if (managementWindow !== null && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send(IPC_CHANNELS.patch, patch);
  }
}

function registerPetIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getSnapshot, (event) => {
    if (!isPetStateSender(event)) {
      throw new Error("Unauthorized snapshot request.");
    }

    return petController.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.command, async (event, input: unknown) => {
    if (!isPetStateSender(event)) {
      throw new Error("Unauthorized pet command.");
    }

    return petController.dispatch(PetCommandSchema.parse(input), Date.now());
  });

  ipcMain.handle(
    IPC_CHANNELS.openManagement,
    (event, input: unknown) => {
      if (!isPetSender(event)) {
        throw new Error("Unauthorized management-window request.");
      }

      openManagementWindow(ManagementTabSchema.parse(input));
    },
  );

  ipcMain.on(IPC_CHANNELS.beginDrag, (event, input: unknown) => {
    if (!isPetSender(event) || petWindow === null) {
      return;
    }

    const point = WindowPointSchema.parse(input);
    const bounds = petWindow.getBounds();
    dragOffset = {
      x: point.x - bounds.x,
      y: point.y - bounds.y,
    };
  });

  ipcMain.on(IPC_CHANNELS.drag, (event, input: unknown) => {
    if (!isPetSender(event) || petWindow === null || dragOffset === null) {
      return;
    }

    const point = WindowPointSchema.parse(input);
    const currentBounds = petWindow.getBounds();
    const nextBounds = clampPetBoundsToWorkAreas(
      {
        ...currentBounds,
        x: Math.round(point.x - dragOffset.x),
        y: Math.round(point.y - dragOffset.y),
      },
      screen.getAllDisplays().map((display) => display.workArea),
    );

    petWindow.setBounds(nextBounds, false);
  });

  ipcMain.on(IPC_CHANNELS.endDrag, (event) => {
    if (isPetSender(event)) {
      dragOffset = null;
    }
  });
}

function secureWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
}

function startScheduler(): void {
  lastTickAt = performance.now();
  scheduler = setInterval(() => {
    const currentTickAt = performance.now();
    const elapsedMs = simulationPaused ? 0 : currentTickAt - lastTickAt;
    lastTickAt = currentTickAt;

    if (elapsedMs > 0) {
      petController.tick(elapsedMs, Date.now());
    }
  }, 1000);
}

function createPetWindow(): BrowserWindow {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const preloadPath = join(currentDirectory, "../preload/pet.cjs");
  const rendererPath = join(currentDirectory, "../renderer/pet/index.html");
  const display = screen.getPrimaryDisplay();
  const initialBounds = calculateInitialPetBounds(display.workArea);
  const window = new BrowserWindow(
    createPetWindowOptions(preloadPath, initialBounds),
  );

  window.setAlwaysOnTop(true, "floating");
  window.setMenuBarVisibility(false);

  secureWindow(window);

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    if (petWindow === window) {
      petWindow = null;
    }
  });

  void window.loadFile(rendererPath);
  return window;
}

function createManagementWindow(initialTab: ManagementTab): BrowserWindow {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const preloadPath = join(
    currentDirectory,
    "../preload/management.cjs",
  );
  const rendererPath = join(
    currentDirectory,
    "../renderer/manage/index.html",
  );
  const window = new BrowserWindow({
    backgroundColor: "#f4f1e8",
    height: 560,
    minHeight: 460,
    minWidth: 620,
    show: false,
    title: "Desktop Pet Management",
    width: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.setMenuBarVisibility(false);
  secureWindow(window);

  window.webContents.once("did-finish-load", () => {
    window.webContents.send(IPC_CHANNELS.managementTab, initialTab);
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    if (managementWindow === window) {
      managementWindow = null;
    }
  });

  void window.loadFile(rendererPath);
  return window;
}

function openManagementWindow(tab: ManagementTab): void {
  if (managementWindow === null || managementWindow.isDestroyed()) {
    managementWindow = createManagementWindow(tab);
    return;
  }

  if (managementWindow.isMinimized()) {
    managementWindow.restore();
  }

  managementWindow.show();
  managementWindow.focus();
  managementWindow.webContents.send(IPC_CHANNELS.managementTab, tab);
}

app.whenReady().then(() => {
  registerPetIpc();
  petController.subscribe(publishPatch);
  startScheduler();

  powerMonitor.on("suspend", () => {
    simulationPaused = true;
  });

  powerMonitor.on("resume", () => {
    lastTickAt = performance.now();
    simulationPaused = false;
  });

  petWindow = createPetWindow();

  app.on("activate", () => {
    if (petWindow === null) {
      petWindow = createPetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (scheduler !== null) {
    clearInterval(scheduler);
    scheduler = null;
  }
  app.quit();
});
