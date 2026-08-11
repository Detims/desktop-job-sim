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
  MeaningfulEvent,
} from "../shared/settings-activity-types.js";
import type { OfflineReturnSummary } from "../shared/offline-summary-types.js";
import type { CharacterVisual } from "../shared/character-types.js";
import type { MailNotification } from "../shared/integration-types.js";

export interface DesktopPetBridge {
  beginDrag(point: WindowPoint): void;
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  drag(point: WindowPoint): void;
  endDrag(): void;
  getSnapshot(): Promise<PetSnapshot>;
  getReturnSummary(): Promise<OfflineReturnSummary | null>;
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  getCharacterVisual(): Promise<CharacterVisual>;
  getMailNotifications(): Promise<MailNotification[]>;
  openCommerce(tab: CommerceTab): Promise<void>;
  openCharacters(): Promise<void>;
  openHome(): Promise<void>;
  openIntegrations(): Promise<void>;
  openManagement(tab: ManagementTab): Promise<void>;
  openSettings(): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  onCharacterChanged(listener: (visual: CharacterVisual) => void): () => void;
  onMailNotificationsChanged(listener: (notifications: MailNotification[]) => void): () => void;
  dismissMailNotification(notificationId: string): Promise<void>;
  openMailNotification(notificationId: string): Promise<void>;
  onReturnSummaryChanged(listener: (summary: OfflineReturnSummary | null) => void): () => void;
  dismissReturnSummary(): Promise<void>;
  readonly runtime: {
    readonly bridgeVersion: 1;
    readonly platform: NodeJS.Platform;
  };
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
  getReturnSummary() {
    return ipcRenderer.invoke(IPC_CHANNELS.getReturnSummary);
  },
  dismissReturnSummary() {
    return ipcRenderer.invoke(IPC_CHANNELS.dismissReturnSummary);
  },
  getActivityPage(request: ActivityPageRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.getActivityPage, request);
  },
  getCharacterVisual() {
    return ipcRenderer.invoke(IPC_CHANNELS.characterGetVisual);
  },
  getMailNotifications() {
    return ipcRenderer.invoke(IPC_CHANNELS.mailNotificationsGet);
  },
  openCommerce(tab: CommerceTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openCommerce, tab);
  },
  openCharacters() {
    return ipcRenderer.invoke(IPC_CHANNELS.openCharacters);
  },
  openHome() {
    return ipcRenderer.invoke(IPC_CHANNELS.openHome);
  },
  openIntegrations() {
    return ipcRenderer.invoke(IPC_CHANNELS.openIntegrations);
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
  onActivityEvent(listener: (event: MeaningfulEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, event: MeaningfulEvent) => {
      listener(event);
    };
    ipcRenderer.on(IPC_CHANNELS.activityEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.activityEvent, handler);
  },
  onCharacterChanged(listener: (visual: CharacterVisual) => void) {
    const handler = (_event: Electron.IpcRendererEvent, visual: CharacterVisual) => {
      listener(visual);
    };
    ipcRenderer.on(IPC_CHANNELS.characterChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.characterChanged, handler);
  },
  onMailNotificationsChanged(listener: (notifications: MailNotification[]) => void) {
    const handler = (_event: Electron.IpcRendererEvent, notifications: MailNotification[]) => listener(notifications);
    ipcRenderer.on(IPC_CHANNELS.mailNotificationsChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mailNotificationsChanged, handler);
  },
  dismissMailNotification(notificationId: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.mailNotificationDismiss, notificationId);
  },
  openMailNotification(notificationId: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.mailNotificationOpen, notificationId);
  },
  onReturnSummaryChanged(listener: (summary: OfflineReturnSummary | null) => void) {
    const handler = (_event: Electron.IpcRendererEvent, summary: OfflineReturnSummary | null) => {
      listener(summary);
    };
    ipcRenderer.on(IPC_CHANNELS.returnSummaryChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.returnSummaryChanged, handler);
  },
  runtime: Object.freeze({
    bridgeVersion: 1,
    platform: process.platform,
  }),
});

contextBridge.exposeInMainWorld("desktopPet", bridge);
