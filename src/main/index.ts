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
  SaveHomeLayoutCommandSchema,
} from "../shared/home-contracts.js";
import {
  ManagementTabSchema,
  PetCommandSchema,
  WindowPointSchema,
  type ManagementTab,
  type PetPatch,
  type WindowPoint,
} from "../shared/contracts.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import {
  ActivityPageRequestSchema,
  UpdateSettingsCommandSchema,
} from "../shared/settings-activity-contracts.js";
import { MemoryPageRequestSchema } from "../shared/memory-contracts.js";
import {
  ACTIVITY_RETENTION_MS,
  CARE_INTENSITY_MULTIPLIERS,
  type AppSettings,
  type MeaningfulEvent,
  type MeaningfulEventDraft,
} from "../shared/settings-activity-types.js";
import type { PetState } from "../shared/pet-types.js";
import type { MemoryEntryDraft } from "../shared/memory-types.js";
import { DiagnosticLogger } from "../persistence/diagnostic-logger.js";
import { PersistenceError } from "../persistence/persistence-error.js";
import { PersistenceSession } from "../persistence/persistence-session.js";
import { recoverPetState } from "../persistence/recovery.js";
import { SqlitePetRepository } from "../persistence/sqlite-pet-repository.js";
import { createInitialHomeLayout } from "../domain/home-layout.js";
import { resolveFurnitureBonuses } from "../domain/furniture-bonuses.js";
import { careerEventDrafts } from "../domain/career.js";
import { createInitialPetState } from "../simulation/pet-simulation.js";
import { HomeLayoutController } from "./home-layout-controller.js";
import { PetController } from "./pet-controller.js";
import { SettingsController } from "./settings-controller.js";
import {
  calculateInitialPetBounds,
  clampPetBoundsToWorkAreas,
  createPetWindowOptions,
  PET_WINDOW_SIZE,
} from "./platform/pet-window.js";

let petWindow: BrowserWindow | null = null;
let managementWindow: BrowserWindow | null = null;
let homeWindow: BrowserWindow | null = null;
let dragOffset: WindowPoint | null = null;
let scheduler: NodeJS.Timeout | null = null;
let lastTickAt = performance.now();
let simulationPaused = false;
let petController: PetController | null = null;
let persistenceSession: PersistenceSession | null = null;
let diagnosticLogger: DiagnosticLogger | null = null;
let cleanShutdownSaved = false;
let persistenceFailed = false;
let homeLayoutController: HomeLayoutController | null = null;
let homeIsDirty = false;
let homeCloseConfirmed = false;
let isQuitting = false;
let homeReadyTimeout: NodeJS.Timeout | null = null;
let settingsController: SettingsController | null = null;
let settingsRepository: SqlitePetRepository | null = null;

function requirePetController(): PetController {
  if (petController === null) {
    throw new Error("Pet controller is not initialized.");
  }
  return petController;
}

function requireHomeLayoutController(): HomeLayoutController {
  if (homeLayoutController === null) {
    throw new Error("Home layout controller is not initialized.");
  }
  return homeLayoutController;
}

function requireSettingsController(): SettingsController {
  if (settingsController === null) {
    throw new Error("Settings controller is not initialized.");
  }
  return settingsController;
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
    (homeWindow !== null && event.sender === homeWindow.webContents) ||
    (managementWindow !== null &&
      event.sender === managementWindow.webContents)
  );
}

function isHomeSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return homeWindow !== null && event.sender === homeWindow.webContents;
}

function publishPatch(patch: PetPatch): void {
  if (petWindow !== null && !petWindow.isDestroyed()) {
    petWindow.webContents.send(IPC_CHANNELS.patch, patch);
  }

  if (managementWindow !== null && !managementWindow.isDestroyed()) {
    managementWindow.webContents.send(IPC_CHANNELS.patch, patch);
  }

  if (homeWindow !== null && !homeWindow.isDestroyed()) {
    homeWindow.webContents.send(IPC_CHANNELS.patch, patch);
  }
}

function publishToPetSurfaces(channel: string, payload: unknown): void {
  for (const window of [petWindow, homeWindow]) {
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

function publishActivityEvent(event: MeaningfulEvent): void {
  publishToPetSurfaces(IPC_CHANNELS.activityEvent, event);
}

function publishSettings(settings: AppSettings): void {
  publishToPetSurfaces(IPC_CHANNELS.settingsChanged, settings);
}

function registerPetIpc(): void {
  ipcMain.on(IPC_CHANNELS.exitApplication, (event) => {
    if (
      managementWindow === null ||
      event.sender !== managementWindow.webContents
    ) {
      return;
    }
    app.quit();
  });

  ipcMain.handle(IPC_CHANNELS.getSettings, (event) => {
    if (!isPetSender(event) && !isHomeSender(event)) {
      throw new Error("Unauthorized settings request.");
    }
    return requireSettingsController().getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.getActivityPage, (event, input: unknown) => {
    if (!isPetSender(event) && !isHomeSender(event)) {
      throw new Error("Unauthorized activity-history request.");
    }
    try {
      const request = ActivityPageRequestSchema.parse(input);
      return settingsRepository?.loadActivityPage(
        request.before,
        request.limit ?? 100,
      );
    } catch (error: unknown) {
      if (error instanceof PersistenceError) handlePersistenceFailure(error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.updateSettings, (event, input: unknown) => {
    if (!isPetSender(event) && !isHomeSender(event)) {
      throw new Error("Unauthorized settings update.");
    }
    try {
      return requireSettingsController().update(
        UpdateSettingsCommandSchema.parse(input),
        Date.now(),
      );
    } catch (error: unknown) {
      if (error instanceof PersistenceError) handlePersistenceFailure(error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.getSnapshot, (event) => {
    if (!isPetStateSender(event)) {
      throw new Error("Unauthorized snapshot request.");
    }

    return requirePetController().getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.getMemoryPage, (event, input: unknown) => {
    if (managementWindow === null || event.sender !== managementWindow.webContents) {
      throw new Error("Unauthorized memory-history request.");
    }
    try {
      const request = MemoryPageRequestSchema.parse(input ?? {});
      return settingsRepository?.loadMemoryPage(
        request.before,
        request.limit ?? 50,
      );
    } catch (error: unknown) {
      if (error instanceof PersistenceError) handlePersistenceFailure(error);
      throw error;
    }
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
      if (!isPetSender(event) && !isHomeSender(event)) {
        throw new Error("Unauthorized management-window request.");
      }

      openManagementWindow(ManagementTabSchema.parse(input));
    },
  );

  ipcMain.handle(IPC_CHANNELS.openHome, (event) => {
    if (!isPetSender(event)) {
      throw new Error("Unauthorized Home-window request.");
    }
    openHomeWindow();
  });

  ipcMain.handle(IPC_CHANNELS.getHomeLayout, (event) => {
    if (!isHomeSender(event)) {
      throw new Error("Unauthorized Home-layout request.");
    }
    return requireHomeLayoutController().getSnapshot();
  });

  ipcMain.handle(
    IPC_CHANNELS.saveHomeLayout,
    (event, input: unknown) => {
      if (!isHomeSender(event)) {
        throw new Error("Unauthorized Home-layout save.");
      }
      try {
        const snapshot = requireHomeLayoutController().save(
          SaveHomeLayoutCommandSchema.parse(input),
        );
        requirePetController().setActivityBonuses(
          resolveFurnitureBonuses(snapshot.layout),
        );
        return snapshot;
      } catch (error: unknown) {
        if (
          error instanceof PersistenceError &&
          error.eventCode !== "home.layout_conflict"
        ) {
          handlePersistenceFailure(error);
        }
        throw error;
      }
    },
  );

  ipcMain.on(IPC_CHANNELS.homeDirty, (event, input: unknown) => {
    if (isHomeSender(event) && typeof input === "boolean") {
      homeIsDirty = input;
    }
  });

  ipcMain.on(IPC_CHANNELS.homeReady, (event) => {
    if (!isHomeSender(event) || homeWindow === null) {
      return;
    }
    if (homeReadyTimeout !== null) {
      clearTimeout(homeReadyTimeout);
      homeReadyTimeout = null;
    }
    petWindow?.hide();
    homeWindow.show();
    homeWindow.focus();
  });

  ipcMain.on(IPC_CHANNELS.requestDesktop, (event) => {
    if (isHomeSender(event)) {
      homeWindow?.close();
    }
  });

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

function restoreDesktopPet(): void {
  if (isQuitting || petWindow === null || petWindow.isDestroyed()) {
    return;
  }
  petWindow.show();
}

function handleHomeUnavailable(eventCode: string, cause: unknown): void {
  diagnosticLogger?.write(
    "error",
    eventCode,
    "Home became unavailable; the desktop pet was restored.",
    { cause: cause instanceof Error ? cause.message : String(cause) },
  );
  restoreDesktopPet();
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

function settlementEvent(
  state: PetState,
  type: "activity.shutdown_settled" | "activity.sleep_settled",
): MeaningfulEventDraft | undefined {
  if (state.activity === null) return undefined;
  return {
    details: {
      accumulatedMs: state.activity.accumulatedMs,
      activityType: state.activity.type,
      definitionId: state.activity.definitionId,
    },
    petId: state.petId,
    summary:
      type === "activity.shutdown_settled"
        ? `${state.activity.type} settled at shutdown; partial progress kept.`
        : `${state.activity.type} settled for sleep; partial progress kept.`,
    type,
  };
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
  const before = petController.getSnapshot().state;
  const event = settlementEvent(
    before,
    "activity.shutdown_settled",
  );
  const snapshot = petController.settleForCleanShutdown(elapsedMs, now);
  const events = careerEventDrafts(before, snapshot.state);
  if (event !== undefined) events.unshift(event);
  persistenceSession.saveClean(snapshot.state, now, events);
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

  window.setAlwaysOnTop(
    requireSettingsController().getSnapshot().alwaysOnTop,
    "floating",
  );
  window.setMenuBarVisibility(false);

  secureWindow(window);

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    if (homeReadyTimeout !== null) {
      clearTimeout(homeReadyTimeout);
      homeReadyTimeout = null;
    }
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

function createHomeWindow(): BrowserWindow {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const preloadPath = join(currentDirectory, "../preload/home.cjs");
  const rendererPath = join(currentDirectory, "../renderer/home/index.html");
  const window = new BrowserWindow({
    backgroundColor: "#241f2e",
    height: 720,
    minHeight: 620,
    minWidth: 820,
    show: false,
    title: "Desktop Pet Home",
    width: 980,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
    },
  });

  homeIsDirty = false;
  homeCloseConfirmed = false;
  window.setMenuBarVisibility(false);
  secureWindow(window);

  window.on("close", (event) => {
    if (isQuitting || homeCloseConfirmed || !homeIsDirty) {
      return;
    }
    event.preventDefault();
    void dialog
      .showMessageBox(window, {
        buttons: ["Discard Changes and Close", "Return to Home"],
        cancelId: 1,
        defaultId: 1,
        detail: "Your unsaved furniture changes will be discarded.",
        message: "Close Home without saving?",
        noLink: true,
        type: "warning",
      })
      .then(({ response }) => {
        if (response === 0 && !window.isDestroyed()) {
          homeCloseConfirmed = true;
          window.close();
        }
      });
  });

  window.on("closed", () => {
    if (homeWindow === window) {
      homeWindow = null;
    }
    homeIsDirty = false;
    homeCloseConfirmed = false;
    restoreDesktopPet();
  });

  window.webContents.on("did-fail-load", (_event, code, description) => {
    handleHomeUnavailable("home.load_failed", `${code}: ${description}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    handleHomeUnavailable("home.renderer_gone", details.reason);
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });

  void window.loadFile(rendererPath).catch((error: unknown) => {
    handleHomeUnavailable("home.load_failed", error);
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });
  homeReadyTimeout = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) {
      handleHomeUnavailable(
        "home.ready_timeout",
        "Home did not become ready within 10 seconds.",
      );
      window.destroy();
    }
  }, 10_000);
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

function openHomeWindow(): void {
  if (homeWindow === null || homeWindow.isDestroyed()) {
    homeWindow = createHomeWindow();
    return;
  }
  if (homeWindow.isMinimized()) {
    homeWindow.restore();
  }
  if (homeWindow.isVisible()) {
    homeWindow.focus();
  }
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
    settingsRepository = repository;
    const initialSettings = repository.loadSettings();
    if (initialSettings.activityRetention === "thirtyDays") {
      repository.pruneActivity(now - ACTIVITY_RETENTION_MS);
    }
    settingsController = new SettingsController(
      initialSettings,
      repository,
      publishActivityEvent,
    );
    const persisted = repository.load();
    const persistedHomeLayout = repository.loadHomeLayout();
    const initialHomeLayout = persistedHomeLayout ?? createInitialHomeLayout();
    if (persistedHomeLayout === null) {
      repository.saveHomeLayout(initialHomeLayout, null);
    }
    homeLayoutController = new HomeLayoutController(
      initialHomeLayout,
      repository,
      publishActivityEvent,
    );
    const defaultBounds = calculateInitialPetBounds(
      screen.getPrimaryDisplay().workArea,
    );
    let initialState: PetState;
    let initialPosition = { x: defaultBounds.x, y: defaultBounds.y };
    let startupEvents: MeaningfulEventDraft[];
    let startupMemories: MemoryEntryDraft[] = [];

    if (persisted === null) {
      initialState = createInitialPetState(now);
      startupEvents = [{
        details: { newProfile: true },
        petId: initialState.petId,
        summary: "New pet profile started.",
        type: "startup.recovered",
      }];
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
        CARE_INTENSITY_MULTIPLIERS[initialSettings.careIntensity],
      );
      initialState = recovery.state;
      initialPosition = persisted.position;
      startupEvents = [
        !persisted.cleanExit && persisted.state.activity !== null
          ? {
              details: {
                accumulatedMs: persisted.state.activity.accumulatedMs,
                activityType: persisted.state.activity.type,
                definitionId: persisted.state.activity.definitionId,
              },
              petId: persisted.state.petId,
              summary: `${persisted.state.activity.type} recovered from its last durable checkpoint.`,
              type: "activity.crash_recovered",
            }
          : {
              details: { offlineElapsedMs: recovery.offlineElapsedMs },
              petId: persisted.state.petId,
              summary: "Pet state recovered at startup.",
              type: "startup.recovered",
            },
      ];
      if (recovery.illnessRecovered) {
        startupEvents.push({
          details: { health: recovery.state.care.health },
          petId: recovery.state.petId,
          summary: "Recovered from Serious Illness while away.",
          type: "care.recovered",
        });
        startupMemories = [{
          category: "illness",
          description: "Recovered from a Serious Illness while the application was closed.",
          petId: recovery.state.petId,
          title: "Recovered from Serious Illness",
        }];
      }
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
      publishActivityEvent,
    );
    persistenceSession.saveCommand(
      initialState,
      now,
      startupEvents,
      startupMemories,
    );
    petController = new PetController(
      initialState,
      (state, committedAt, events, memories) => {
        persistenceSession?.saveCommand(state, committedAt, events, memories);
      },
      resolveFurnitureBonuses(initialHomeLayout),
    );
    petController.setPassiveNeedMultiplier(
      CARE_INTENSITY_MULTIPLIERS[initialSettings.careIntensity],
    );
    settingsController.subscribe((settings) => {
      petController?.setPassiveNeedMultiplier(
        CARE_INTENSITY_MULTIPLIERS[settings.careIntensity],
      );
      if (petWindow !== null && !petWindow.isDestroyed()) {
        petWindow.setAlwaysOnTop(settings.alwaysOnTop, "floating");
      }
      publishSettings(settings);
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
    const currentTickAt = performance.now();
    const elapsedMs = simulationPaused
      ? 0
      : Math.max(0, currentTickAt - lastTickAt);
    const now = Date.now();
    try {
      const before = requirePetController().getSnapshot().state;
      const event = settlementEvent(
        before,
        "activity.sleep_settled",
      );
      const snapshot = requirePetController().settleForInterruption(
        elapsedMs,
        now,
      );
      const events = careerEventDrafts(before, snapshot.state);
      if (event !== undefined) events.unshift(event);
      persistenceSession?.saveCommand(snapshot.state, now, events);
    } catch (error: unknown) {
      handlePersistenceFailure(error);
    }
    lastTickAt = currentTickAt;
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
  isQuitting = true;
  try {
    saveCleanShutdown();
  } catch (error: unknown) {
    event.preventDefault();
    isQuitting = false;
    handlePersistenceFailure(error);
  }
});
