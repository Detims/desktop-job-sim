import { contextBridge, ipcRenderer } from "electron";

import {
  type PetCommand,
  type ManagementTab,
  type PetPatch,
  type PetSnapshot,
  type WindowPoint,
} from "../shared/pet-types.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";

export interface DesktopPetBridge {
  beginDrag(point: WindowPoint): void;
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  drag(point: WindowPoint): void;
  endDrag(): void;
  getSnapshot(): Promise<PetSnapshot>;
  openManagement(tab: ManagementTab): Promise<void>;
  onPatch(listener: (patch: PetPatch) => void): () => void;
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
  openManagement(tab: ManagementTab) {
    return ipcRenderer.invoke(IPC_CHANNELS.openManagement, tab);
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
  runtime: Object.freeze({
    bridgeVersion: 1,
    platform: process.platform,
  }),
});

contextBridge.exposeInMainWorld("desktopPet", bridge);
