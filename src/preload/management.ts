import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  ManagementTab,
  PetCommand,
  PetPatch,
  PetSnapshot,
} from "../shared/pet-types.js";
import type {
  MemoryPage,
  MemoryPageRequest,
} from "../shared/memory-types.js";

export interface DesktopManagementBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  exitApplication(): void;
  getSnapshot(): Promise<PetSnapshot>;
  getMemoryPage(request?: MemoryPageRequest): Promise<MemoryPage>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
  onTabRequested(listener: (tab: ManagementTab) => void): () => void;
}

let currentTab: ManagementTab = "work";
const tabListeners = new Set<(tab: ManagementTab) => void>();

ipcRenderer.on(
  IPC_CHANNELS.managementTab,
  (_event, tab: ManagementTab) => {
    if (tab !== "work" && tab !== "careers" && tab !== "memories") {
      return;
    }

    currentTab = tab;
    for (const listener of tabListeners) {
      listener(tab);
    }
  },
);

const bridge: DesktopManagementBridge = Object.freeze({
  dispatch(command: PetCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.command, command);
  },
  exitApplication() {
    ipcRenderer.send(IPC_CHANNELS.exitApplication);
  },
  getSnapshot() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSnapshot);
  },
  getMemoryPage(request: MemoryPageRequest = {}) {
    return ipcRenderer.invoke(IPC_CHANNELS.getMemoryPage, request);
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
  onTabRequested(listener: (tab: ManagementTab) => void) {
    tabListeners.add(listener);
    listener(currentTab);
    return () => {
      tabListeners.delete(listener);
    };
  },
});

contextBridge.exposeInMainWorld("desktopManagement", bridge);
