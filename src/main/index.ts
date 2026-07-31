import {
  app,
  BrowserWindow,
  dialog,
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
import type { PetState } from "../shared/pet-types.js";
import { DiagnosticLogger } from "../persistence/diagnostic-logger.js";
import { PersistenceError } from "../persistence/persistence-error.js";
import { PersistenceSession } from "../persistence/persistence-session.js";
import { recoverPetState } from "../persistence/recovery.js";
import { SqlitePetRepository } from "../persistence/sqlite-pet-repository.js";
import { createInitialPetState } from "../simulation/pet-simulation.js";
import { PetController } from "./pet-controller.js";
import {
  calculateInitialPetBounds,
  clampPetBoundsToWorkAreas,
  createPetWindowOptions,
  PET_WINDOW_SIZE,
} from "./platform/pet-window.js";

let petWindow: BrowserWindow | null = null;
let managementWindow: BrowserWindow | null = null;
let dragOffset: WindowPoint | null = null;
let scheduler: NodeJS.Timeout | null = null;
let lastTickAt = performance.now();
let simulationPaused = false;
let petController: PetController | null = null;
let persistenceSession: PersistenceSession | null = null;
let diagnosticLogger: DiagnosticLogger | null = null;
let cleanShutdownSaved = false;
let persistenceFailed = false;

function requirePetController(): PetController {
  if (petController === null) {
    throw new Error("Pet controller is not initialized.");
  }
  return petController;
}

function handlePersistenceFailure(error: unknown): void {
  if (persistenceFailed) {
    return;
  }

  persistenceFailed = true;
  simulationPaused = true;
  if (scheduler !== null) {
    clearInterval(scheduler);
    scheduler = null;
  }
  diagnosticLogger?.write(
    "error",
    error instanceof PersistenceError
      ? error.eventCode
      : "persistence.runtime_failed",
    "Persistence failed while the application was running.",
    { cause: error instanceof Error ? error.message : String(error) },
  );
  dialog.showErrorBox(
    "Desktop Pet paused",
    "Pet state could not be saved safely. Simulation has been paused; progress was not reset. Check the local diagnostics before restarting.",
  );
}

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

    return requirePetController().getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.command, async (event, input: unknown) => {
    if (!isPetStateSender(event)) {
      throw new Error("Unauthorized pet command.");
    }

    try {
      return await requirePetController().dispatch(
        PetCommandSchema.parse(input),
        Date.now(),
      );
    } catch (error: unknown) {
      if (error instanceof PersistenceError) {
        handlePersistenceFailure(error);
      }
      throw error;
    }
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
      if (petWindow !== null && persistenceSession !== null) {
        const bounds = petWindow.getBounds();
        try {
          persistenceSession.savePosition(
            { x: bounds.x, y: bounds.y },
            requirePetController().getSnapshot().state,
            Date.now(),
          );
        } catch (error: unknown) {
          handlePersistenceFailure(error);
        }
      }
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
      const now = Date.now();
      const snapshot = requirePetController().tick(elapsedMs, now);
      try {
        persistenceSession?.maybeCheckpoint(snapshot.state, now);
      } catch (error: unknown) {
        handlePersistenceFailure(error);
      }
    }
  }, 1000);
}

function saveCleanShutdown(): void {
  if (
    cleanShutdownSaved ||
    petController === null ||
    persistenceSession === null
  ) {
    return;
  }

  const currentTickAt = performance.now();
  const elapsedMs =
    simulationPaused || persistenceFailed
      ? 0
      : Math.max(0, currentTickAt - lastTickAt);
  const now = Date.now();
  const snapshot = petController.settleForCleanShutdown(elapsedMs, now);
  persistenceSession.saveClean(snapshot.state, now);
  persistenceSession.close();
  cleanShutdownSaved = true;
  if (scheduler !== null) {
    clearInterval(scheduler);
    scheduler = null;
  }
}

function createPetWindow(): BrowserWindow {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const preloadPath = join(currentDirectory, "../preload/pet.cjs");
  const rendererPath = join(currentDirectory, "../renderer/pet/index.html");
  const initialPosition = persistenceSession?.getPosition();
  const initialBounds =
    initialPosition === undefined
      ? calculateInitialPetBounds(screen.getPrimaryDisplay().workArea)
      : clampPetBoundsToWorkAreas(
          { ...PET_WINDOW_SIZE, ...initialPosition },
          screen.getAllDisplays().map((display) => display.workArea),
        );
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

  window.on("session-end", () => {
    try {
      saveCleanShutdown();
    } catch (error: unknown) {
      diagnosticLogger?.write(
        "error",
        "shutdown.session_save_failed",
        "Pet state could not be saved during Windows session shutdown.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
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
  const now = Date.now();

  try {
    const userDataPath = app.getPath("userData");
    diagnosticLogger = new DiagnosticLogger(
      join(userDataPath, "diagnostics", "diagnostics.jsonl"),
      { userDataPath },
    );
    const repository = SqlitePetRepository.open(
      {
        backupPath: join(userDataPath, "data", "pet.sqlite.backup"),
        databasePath: join(userDataPath, "data", "pet.sqlite"),
      },
      diagnosticLogger,
    );
    const persisted = repository.load();
    const defaultBounds = calculateInitialPetBounds(
      screen.getPrimaryDisplay().workArea,
    );
    let initialState: PetState;
    let initialPosition = { x: defaultBounds.x, y: defaultBounds.y };

    if (persisted === null) {
      initialState = createInitialPetState(now);
      diagnosticLogger.write(
        "info",
        "database.profile_created",
        "A new local pet profile was created.",
      );
    } else {
      const recovery = recoverPetState(
        persisted.state,
        persisted.savedAt,
        now,
        persisted.cleanExit,
      );
      initialState = recovery.state;
      initialPosition = persisted.position;
      for (const diagnostic of recovery.diagnostics) {
        diagnosticLogger.write(
          diagnostic.code === "recovery.clean_start" ? "info" : "warning",
          diagnostic.code,
          "Persisted pet state was reconciled during startup.",
          diagnostic.context,
        );
      }
    }

    const clampedBounds = clampPetBoundsToWorkAreas(
      { ...PET_WINDOW_SIZE, ...initialPosition },
      screen.getAllDisplays().map((display) => display.workArea),
    );
    persistenceSession = new PersistenceSession(
      repository,
      { x: clampedBounds.x, y: clampedBounds.y },
      initialState,
    );
    persistenceSession.saveCommand(initialState, now);
    petController = new PetController(initialState, (state, committedAt) => {
      persistenceSession?.saveCommand(state, committedAt);
    });

    registerPetIpc();
    petController.subscribe(publishPatch);
    startScheduler();
  } catch (error: unknown) {
    diagnosticLogger?.write(
      "error",
      error instanceof PersistenceError
        ? error.eventCode
        : "startup.persistence_failed",
      "Desktop Pet stopped before opening a window because persistence was not safe.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
    dialog.showErrorBox(
      "Desktop Pet could not start",
      "The local pet database could not be opened safely. No profile was reset. Review diagnostics under the application user-data directory.",
    );
    app.quit();
    return;
  }

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
  app.quit();
});

app.on("before-quit", (event) => {
  try {
    saveCleanShutdown();
  } catch (error: unknown) {
    event.preventDefault();
    handlePersistenceFailure(error);
  }
});
