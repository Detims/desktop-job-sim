import { contextBridge, ipcRenderer } from "electron";

import type {
  HomeLayoutSnapshot,
  SaveHomeLayoutCommand,
} from "../shared/home-types.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  ManagementTab,
  PetCommand,
  PetPatch,
  PetSnapshot,
} from "../shared/pet-types.js";
import type {
  ActivityPage,
  ActivityPageRequest,
  AppSettings,
  MeaningfulEvent,
  UpdateSettingsCommand,
} from "../shared/settings-activity-types.js";

export interface DesktopHomeBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  getLayout(): Promise<HomeLayoutSnapshot>;
  getSnapshot(): Promise<PetSnapshot>;
  getSettings(): Promise<AppSettings>;
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  openManagement(tab: ManagementTab): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  ready(): void;
  requestDesktop(): void;
  saveLayout(command: SaveHomeLayoutCommand): Promise<HomeLayoutSnapshot>;
  setDirty(dirty: boolean): void;
  updateSettings(command: UpdateSettingsCommand): Promise<AppSettings>;
}

const bridge: DesktopHomeBridge = Object.freeze({
  dispatch(command: PetCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.command, command);
  },
  getLayout() {
    return ipcRenderer.invoke(IPC_CHANNELS.getHomeLayout);
  },
  getSnapshot() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSnapshot);
  },
  getSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSettings);
  },
  getActivityPage(request: ActivityPageRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.getActivityPage, request);
  },
  openManagement(tab: ManagementTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openManagement, tab);
  },
  onPatch(listener: (patch: PetPatch) => void) {
    const handler = (_event: Electron.IpcRendererEvent, patch: PetPatch) => {
      listener(patch);
    };
    ipcRenderer.on(IPC_CHANNELS.patch, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.patch, handler);
  },
  onSettingsChanged(listener: (settings: AppSettings) => void) {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      listener(settings);
    };
    ipcRenderer.on(IPC_CHANNELS.settingsChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.settingsChanged, handler);
  },
  onActivityEvent(listener: (event: MeaningfulEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, event: MeaningfulEvent) => {
      listener(event);
    };
    ipcRenderer.on(IPC_CHANNELS.activityEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.activityEvent, handler);
  },
  ready() {
    ipcRenderer.send(IPC_CHANNELS.homeReady);
  },
  requestDesktop() {
    ipcRenderer.send(IPC_CHANNELS.requestDesktop);
  },
  saveLayout(command: SaveHomeLayoutCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.saveHomeLayout, command);
  },
  setDirty(dirty: boolean) {
    ipcRenderer.send(IPC_CHANNELS.homeDirty, dirty);
  },
  updateSettings(command: UpdateSettingsCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.updateSettings, command);
  },
});

contextBridge.exposeInMainWorld("desktopHome", bridge);
