import type { DesktopIntegrationsBridge } from "../../preload/integrations.js";

declare global {
  interface Window {
    readonly desktopIntegrations: DesktopIntegrationsBridge;
  }
}

export {};
