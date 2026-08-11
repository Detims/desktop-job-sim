import { contextBridge, ipcRenderer } from "electron";

import type {
  IntegrationCommand,
  IntegrationSnapshot,
} from "../shared/integration-types.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";

export interface DesktopIntegrationsBridge {
  command(command: IntegrationCommand): Promise<IntegrationSnapshot>;
  getSnapshot(): Promise<IntegrationSnapshot>;
  onChanged(listener: (snapshot: IntegrationSnapshot) => void): () => void;
}

const bridge: DesktopIntegrationsBridge = Object.freeze({
  command(command: IntegrationCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.integrationCommand, command);
  },
  getSnapshot() {
    return ipcRenderer.invoke(IPC_CHANNELS.integrationGetSnapshot);
  },
  onChanged(listener: (snapshot: IntegrationSnapshot) => void) {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: IntegrationSnapshot) => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.integrationChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.integrationChanged, handler);
  },
});

contextBridge.exposeInMainWorld("desktopIntegrations", bridge);
