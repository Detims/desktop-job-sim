import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  AppSettings,
  UpdateSettingsCommand,
} from "../shared/settings-activity-types.js";

export interface DesktopSettingsBridge {
  getSettings(): Promise<AppSettings>;
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void;
  updateSettings(command: UpdateSettingsCommand): Promise<AppSettings>;
}

const bridge: DesktopSettingsBridge = Object.freeze({
  getSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSettings);
  },
  onSettingsChanged(listener: (settings: AppSettings) => void) {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      listener(settings);
    };
    ipcRenderer.on(IPC_CHANNELS.settingsChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.settingsChanged, handler);
  },
  updateSettings(command: UpdateSettingsCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.updateSettings, command);
  },
});

contextBridge.exposeInMainWorld("desktopSettings", bridge);
