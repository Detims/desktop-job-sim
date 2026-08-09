import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  CommerceTab,
  PetCommand,
  PetPatch,
  PetSnapshot,
} from "../shared/pet-types.js";

export interface DesktopCommerceBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  getSnapshot(): Promise<PetSnapshot>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onTabRequested(listener: (tab: CommerceTab) => void): () => void;
}

let currentTab: CommerceTab = "shop";
const tabListeners = new Set<(tab: CommerceTab) => void>();

ipcRenderer.on(IPC_CHANNELS.commerceTab, (_event, tab: CommerceTab) => {
  if (tab !== "shop" && tab !== "inventory") return;
  currentTab = tab;
  for (const listener of tabListeners) listener(tab);
});

const bridge: DesktopCommerceBridge = Object.freeze({
  dispatch(command: PetCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.command, command);
  },
  getSnapshot() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSnapshot);
  },
  onPatch(listener: (patch: PetPatch) => void) {
    const handler = (_event: Electron.IpcRendererEvent, patch: PetPatch) => {
      listener(patch);
    };
    ipcRenderer.on(IPC_CHANNELS.patch, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.patch, handler);
  },
  onTabRequested(listener: (tab: CommerceTab) => void) {
    tabListeners.add(listener);
    listener(currentTab);
    return () => tabListeners.delete(listener);
  },
});

contextBridge.exposeInMainWorld("desktopCommerce", bridge);
