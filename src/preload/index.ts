import { contextBridge, ipcRenderer } from "electron";

import {
  type PetCommand,
  type CommerceTab,
  type ManagementTab,
  type PetPatch,
  type PetSnapshot,
  type WindowPoint,
} from "../shared/pet-types.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  ActivityPage,
  ActivityPageRequest,
  AppSettings,
  MeaningfulEvent,
  UpdateSettingsCommand,
} from "../shared/settings-activity-types.js";

export interface DesktopPetBridge {
  beginDrag(point: WindowPoint): void;
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  drag(point: WindowPoint): void;
  endDrag(): void;
  getSnapshot(): Promise<PetSnapshot>;
  getSettings(): Promise<AppSettings>;
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  openCommerce(tab: CommerceTab): Promise<void>;
  openHome(): Promise<void>;
  openManagement(tab: ManagementTab): Promise<void>;
  openSettings(): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  readonly runtime: {
    readonly bridgeVersion: 1;
    readonly platform: NodeJS.Platform;
  };
  updateSettings(command: UpdateSettingsCommand): Promise<AppSettings>;
}

const bridge: DesktopPetBridge = Object.freeze({
  beginDrag(point: WindowPoint) {
    ipcRenderer.send(IPC_CHANNELS.beginDrag, point);
  },
  dispatch(command: PetCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.command, command);
  },
  drag(point: WindowPoint) {
    ipcRenderer.send(IPC_CHANNELS.drag, point);
  },
  endDrag() {
    ipcRenderer.send(IPC_CHANNELS.endDrag);
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
  openCommerce(tab: CommerceTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openCommerce, tab);
  },
  openHome() {
    return ipcRenderer.invoke(IPC_CHANNELS.openHome);
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
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.patch, handler);
    };
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
  runtime: Object.freeze({
    bridgeVersion: 1,
    platform: process.platform,
  }),
  updateSettings(command: UpdateSettingsCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.updateSettings, command);
  },
});

contextBridge.exposeInMainWorld("desktopPet", bridge);
