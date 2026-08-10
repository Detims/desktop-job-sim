import { contextBridge, ipcRenderer } from "electron";

import type {
  HomeLayoutSnapshot,
  SaveHomeLayoutCommand,
} from "../shared/home-types.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  ManagementTab,
  CommerceTab,
  PetCommand,
  PetPatch,
  PetSnapshot,
} from "../shared/pet-types.js";
import type {
  ActivityPage,
  ActivityPageRequest,
  MeaningfulEvent,
} from "../shared/settings-activity-types.js";
import type { OfflineReturnSummary } from "../shared/offline-summary-types.js";

export interface DesktopHomeBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  getLayout(): Promise<HomeLayoutSnapshot>;
  getSnapshot(): Promise<PetSnapshot>;
  getReturnSummary(): Promise<OfflineReturnSummary | null>;
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  openCommerce(tab: CommerceTab): Promise<void>;
  openManagement(tab: ManagementTab): Promise<void>;
  openSettings(): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  onReturnSummaryChanged(listener: (summary: OfflineReturnSummary | null) => void): () => void;
  dismissReturnSummary(): Promise<void>;
  ready(): void;
  requestDesktop(): void;
  saveLayout(command: SaveHomeLayoutCommand): Promise<HomeLayoutSnapshot>;
  setDirty(dirty: boolean): void;
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
  getReturnSummary() {
    return ipcRenderer.invoke(IPC_CHANNELS.getReturnSummary);
  },
  dismissReturnSummary() {
    return ipcRenderer.invoke(IPC_CHANNELS.dismissReturnSummary);
  },
  getActivityPage(request: ActivityPageRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.getActivityPage, request);
  },
  openCommerce(tab: CommerceTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openCommerce, tab);
  },
  openManagement(tab: ManagementTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openManagement, tab);
  },
  openSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.openSettings);
  },
  onPatch(listener: (patch: PetPatch) => void) {
    const handler = (_event: Electron.IpcRendererEvent, patch: PetPatch) => {
      listener(patch);
    };
    ipcRenderer.on(IPC_CHANNELS.patch, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.patch, handler);
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
  onReturnSummaryChanged(listener: (summary: OfflineReturnSummary | null) => void) {
    const handler = (_event: Electron.IpcRendererEvent, summary: OfflineReturnSummary | null) => {
      listener(summary);
    };
    ipcRenderer.on(IPC_CHANNELS.returnSummaryChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.returnSummaryChanged, handler);
  },
});

contextBridge.exposeInMainWorld("desktopHome", bridge);
