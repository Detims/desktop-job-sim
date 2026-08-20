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
  AppSettings,
  MeaningfulEvent,
} from "../shared/settings-activity-types.js";
import type { OfflineReturnSummary } from "../shared/offline-summary-types.js";
import type { CharacterVisual } from "../shared/character-types.js";
import type { MailNotification } from "../shared/integration-types.js";

export interface DesktopHomeBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  getLayout(): Promise<HomeLayoutSnapshot>;
  getSnapshot(): Promise<PetSnapshot>;
  getReturnSummary(): Promise<OfflineReturnSummary | null>;
  getSettings(): Promise<AppSettings>;
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  getCharacterVisual(): Promise<CharacterVisual>;
  getMailNotifications(): Promise<MailNotification[]>;
  openCommerce(tab: CommerceTab): Promise<void>;
  openCharacters(): Promise<void>;
  openManagement(tab: ManagementTab): Promise<void>;
  openIntegrations(): Promise<void>;
  openSettings(): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  onCharacterChanged(listener: (visual: CharacterVisual) => void): () => void;
  onMailNotificationsChanged(listener: (notifications: MailNotification[]) => void): () => void;
  dismissMailNotification(notificationId: string): Promise<void>;
  openMailNotification(notificationId: string): Promise<void>;
  onReturnSummaryChanged(listener: (summary: OfflineReturnSummary | null) => void): () => void;
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void;
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
  getSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSettings);
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
  openManagement(tab: ManagementTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openManagement, tab);
  },
  openIntegrations() {
    return ipcRenderer.invoke(IPC_CHANNELS.openIntegrations);
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
  onSettingsChanged(listener: (settings: AppSettings) => void) {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings) => listener(settings);
    ipcRenderer.on(IPC_CHANNELS.settingsChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.settingsChanged, handler);
  },
});

contextBridge.exposeInMainWorld("desktopHome", bridge);
