import type {
  BrowserWindowConstructorOptions,
  Rectangle,
} from "electron";

export const PET_WINDOW_SIZE = Object.freeze({
  height: 320,
  width: 360,
});

const WORK_AREA_MARGIN = 24;
export const MINIMUM_VISIBLE_GRAB_AREA = 48;

export function calculateInitialPetBounds(workArea: Rectangle): Rectangle {
  return {
    height: PET_WINDOW_SIZE.height,
    width: PET_WINDOW_SIZE.width,
    x:
      workArea.x +
      Math.max(
        0,
        workArea.width - PET_WINDOW_SIZE.width - WORK_AREA_MARGIN,
      ),
    y:
      workArea.y +
      Math.max(
        0,
        workArea.height - PET_WINDOW_SIZE.height - WORK_AREA_MARGIN,
      ),
  };
}

export function createPetWindowOptions(
  preloadPath: string,
  bounds: Rectangle,
): BrowserWindowConstructorOptions {
  return {
    ...bounds,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    frame: false,
    fullscreenable: false,
    hasShadow: false,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
    },
  };
}

export function clampPetBoundsToWorkAreas(
  bounds: Rectangle,
  workAreas: readonly Rectangle[],
  minimumVisible = MINIMUM_VISIBLE_GRAB_AREA,
): Rectangle {
  if (workAreas.length === 0) {
    return bounds;
  }

  const candidates = workAreas.map((workArea) => {
    const minX = workArea.x - bounds.width + minimumVisible;
    const maxX = workArea.x + workArea.width - minimumVisible;
    const minY = workArea.y - bounds.height + minimumVisible;
    const maxY = workArea.y + workArea.height - minimumVisible;
    const x = Math.min(maxX, Math.max(minX, bounds.x));
    const y = Math.min(maxY, Math.max(minY, bounds.y));
    const distance = Math.hypot(x - bounds.x, y - bounds.y);

    return {
      bounds: {
        ...bounds,
        x,
        y,
      },
      distance,
    };
  });

  candidates.sort((left, right) => left.distance - right.distance);
  return candidates[0]?.bounds ?? bounds;
}
