import type { DesktopManagementBridge } from "../../preload/management.js";

declare global {
  interface Window {
    readonly desktopManagement: DesktopManagementBridge;
  }
}

export {};

