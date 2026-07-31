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

export interface DesktopHomeBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  getLayout(): Promise<HomeLayoutSnapshot>;
  getSnapshot(): Promise<PetSnapshot>;
  openManagement(tab: ManagementTab): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
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
});

contextBridge.exposeInMainWorld("desktopHome", bridge);
