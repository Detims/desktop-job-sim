import { contextBridge, ipcRenderer } from "electron";

import type {
  CharacterCommand,
  CharacterLibrarySnapshot,
  CharacterPackPreview,
} from "../shared/character-types.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";

export interface DesktopCharactersBridge {
  command(command: CharacterCommand): Promise<CharacterLibrarySnapshot>;
  getLibrary(): Promise<CharacterLibrarySnapshot>;
  onLibraryChanged(listener: (library: CharacterLibrarySnapshot) => void): () => void;
  selectImport(): Promise<CharacterPackPreview | null>;
}

const bridge: DesktopCharactersBridge = Object.freeze({
  command(command: CharacterCommand) {
    return ipcRenderer.invoke(IPC_CHANNELS.characterCommand, command);
  },
  getLibrary() {
    return ipcRenderer.invoke(IPC_CHANNELS.characterGetLibrary);
  },
  onLibraryChanged(listener: (library: CharacterLibrarySnapshot) => void) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      library: CharacterLibrarySnapshot,
    ) => listener(library);
    ipcRenderer.on(IPC_CHANNELS.characterLibraryChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.characterLibraryChanged, handler);
  },
  selectImport() {
    return ipcRenderer.invoke(IPC_CHANNELS.characterSelectImport);
  },
});

contextBridge.exposeInMainWorld("desktopCharacters", bridge);
