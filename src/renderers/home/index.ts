import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Text,
  Texture,
} from "pixi.js";

import spriteSheetUrl from "../../../content/core/characters/prototype-cat/idle.png";
import { activityLabel } from "../../shared/activity-label.js";
import {
  HOME_GRID_COLUMNS,
  HOME_GRID_ROWS,
  validateHomeFurniture,
} from "../../domain/home-layout.js";
import type {
  FurniturePlacement,
  HomeLayout,
} from "../../shared/home-types.js";
import type {
  ManagementTab,
  NeedState,
  PetCommand,
  PetState,
} from "../../shared/pet-types.js";
import { applyPatch, readSnapshot } from "../shared/pet-store.js";
import { initializePetOverlay } from "../shared/pet-overlay.js";
import "./styles.css";
import "../shared/pet-overlay.css";

const ROOM_WIDTH = 720;
const ROOM_HEIGHT = 480;
const CELL_SIZE = ROOM_WIDTH / HOME_GRID_COLUMNS;
const FRAME_COUNT = 4;
const PET_X = ROOM_WIDTH / 2;
const PET_BOTTOM = ROOM_HEIGHT - 18;
const PET_HIT_WIDTH = 130;
const PET_HIT_HEIGHT = 125;

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function cloneLayout(layout: HomeLayout): HomeLayout {
  return structuredClone(layout);
}

function sameFurniture(
  left: readonly FurniturePlacement[],
  right: readonly FurniturePlacement[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const canvasRoot = requiredElement<HTMLElement>("#home-canvas");
const statsOverlay = requiredElement<HTMLElement>("#pet-stats-overlay");
const workOverlay = requiredElement<HTMLElement>("#work-overlay");
const workCountdown = requiredElement<HTMLOutputElement>("#work-countdown");
const cancelWorkButton = requiredElement<HTMLButtonElement>("#cancel-work-button");
const saveButton = requiredElement<HTMLButtonElement>("#save-button");
const discardButton = requiredElement<HTMLButtonElement>("#discard-button");
const layoutStatus = requiredElement<HTMLOutputElement>("#layout-status");
const desktopButton = requiredElement<HTMLButtonElement>("#desktop-button");
const workMenuButton = requiredElement<HTMLButtonElement>("#work-menu-button");
const careersMenuButton = requiredElement<HTMLButtonElement>("#careers-menu-button");
const statusText = requiredElement<HTMLOutputElement>("#status-text");
const conditionStatus = requiredElement<HTMLElement>("#condition-status");
const walletText = requiredElement<HTMLElement>("#wallet");
const masteryText = requiredElement<HTMLElement>("#mastery");
const knowledgeText = requiredElement<HTMLElement>("#knowledge");
const needElements: Readonly<Record<keyof NeedState, HTMLProgressElement>> = {
  energy: requiredElement<HTMLProgressElement>("#energy"),
  hunger: requiredElement<HTMLProgressElement>("#hunger"),
  mood: requiredElement<HTMLProgressElement>("#mood"),
  thirst: requiredElement<HTMLProgressElement>("#thirst"),
};

const [petSnapshot, layoutSnapshot] = await Promise.all([
  window.desktopHome.getSnapshot(),
  window.desktopHome.getLayout(),
]);
let currentState: PetState = readSnapshot(petSnapshot);
const petOverlay = await initializePetOverlay(window.desktopHome, {
  walkEnabled: false,
});
let savedLayout = cloneLayout(layoutSnapshot.layout);
let draftLayout = cloneLayout(layoutSnapshot.layout);
let resyncInFlight: Promise<void> | null = null;
let statsOpen = false;
let saving = false;

const pixi = new Application();
await pixi.init({
  antialias: true,
  backgroundAlpha: 0,
  height: ROOM_HEIGHT,
  preference: "webgl",
  resolution: window.devicePixelRatio,
  width: ROOM_WIDTH,
});
// Furniture and the current pet animation do not benefit from a 60 FPS loop.
// Keep the Home renderer inexpensive while it coexists with Management.
pixi.ticker.maxFPS = 12;
pixi.canvas.setAttribute("aria-label", "Starter room with draggable furniture and pet");
pixi.canvas.tabIndex = 0;
canvasRoot.appendChild(pixi.canvas);

const roomLayer = new Graphics()
  .rect(0, 0, ROOM_WIDTH, ROOM_HEIGHT)
  .fill({ color: 0x493c54 })
  .rect(12, 12, ROOM_WIDTH - 24, ROOM_HEIGHT - 24)
  .fill({ color: 0x69586f });
for (let column = 0; column <= HOME_GRID_COLUMNS; column += 1) {
  roomLayer
    .moveTo(column * CELL_SIZE, 0)
    .lineTo(column * CELL_SIZE, ROOM_HEIGHT)
    .stroke({ color: 0xffffff, alpha: 0.17, width: 1 });
}
for (let row = 0; row <= HOME_GRID_ROWS; row += 1) {
  roomLayer
    .moveTo(0, row * CELL_SIZE)
    .lineTo(ROOM_WIDTH, row * CELL_SIZE)
    .stroke({ color: 0xffffff, alpha: 0.17, width: 1 });
}
pixi.stage.addChild(roomLayer);

const furnitureLayer = new Container();
pixi.stage.addChild(furnitureLayer);

function renderFurniture(invalidId: string | null = null): void {
  for (const child of furnitureLayer.removeChildren()) child.destroy();
  for (const placement of draftLayout.furniture) {
    const invalid = placement.id === invalidId;
    const x = placement.x * CELL_SIZE;
    const y = placement.y * CELL_SIZE;
    const width = placement.width * CELL_SIZE;
    const height = placement.height * CELL_SIZE;
    const color = invalid
      ? 0xdc2626
      : placement.kind === "bed"
        ? 0xd8a6b8
        : 0x9b7149;
    const graphic = new Graphics()
      .roundRect(x + 3, y + 3, width - 6, height - 6, 9)
      .fill({ color, alpha: invalid ? 0.72 : 0.96 })
      .stroke({ color: invalid ? 0xffd1d1 : 0x33283a, width: invalid ? 4 : 2 });
    if (placement.kind === "bed") {
      graphic
        .roundRect(x + 12, y + 13, width - 24, height * 0.35, 7)
        .fill({ color: 0xf5e6de, alpha: 0.9 });
    } else {
      graphic
        .rect(x + 14, y + 17, width - 28, 8)
        .fill({ color: 0x33283a, alpha: 0.8 });
    }
    const label = new Text({
      style: {
        fill: invalid ? 0xffffff : 0x251b2b,
        fontFamily: "Segoe UI",
        fontSize: 15,
        fontWeight: "700",
      },
      text: placement.kind === "bed" ? "Bed" : "Desk",
    });
    label.anchor.set(0.5);
    label.position.set(x + width / 2, y + height / 2 + 18);
    furnitureLayer.addChild(graphic, label);
  }
}

let petVisual: AnimatedSprite | Graphics;
try {
  const sheet = await Assets.load<Texture>(spriteSheetUrl);
  const frameWidth = Math.floor(sheet.width / FRAME_COUNT);
  const frames = Array.from(
    { length: FRAME_COUNT },
    (_, index) =>
      new Texture({
        frame: new Rectangle(frameWidth * index, 0, frameWidth, sheet.height),
        source: sheet.source,
      }),
  );
  const sprite = new AnimatedSprite(frames);
  sprite.anchor.set(0.5, 1);
  sprite.animationSpeed = 0.035;
  sprite.scale.set(Math.min(130 / frameWidth, 125 / sheet.height));
  sprite.play();
  petVisual = sprite;
} catch (error: unknown) {
  console.error("Unable to load the Home pet sprite.", error);
  petVisual = new Graphics()
    .circle(0, -50, 48)
    .fill({ color: 0xf59e0b })
    .circle(-17, -58, 6)
    .circle(17, -58, 6)
    .fill({ color: 0x342018 });
}
petVisual.position.set(PET_X, PET_BOTTOM);
pixi.stage.addChild(petVisual);
renderFurniture();

function renderState(state: PetState): void {
  petOverlay.renderState(state);
  for (const name of Object.keys(needElements) as (keyof NeedState)[]) {
    needElements[name].value = state.needs[name];
  }
  walletText.textContent = `${state.household.wallet.toFixed(1)}c`;
  masteryText.textContent = `${state.mastery.toFixed(1)}★`;
  knowledgeText.textContent = `${(state.knowledge["core:general"] ?? 0).toFixed(1)}K`;
  statusText.value = state.statusText;
  const discouraged = state.conditions["core:discouraged"];
  conditionStatus.hidden = discouraged === undefined;
  conditionStatus.textContent =
    discouraged === undefined
      ? ""
      : `Discouraged · ${Math.max(0, Math.ceil((discouraged.expiresAt - Date.now()) / 60_000))}m`;
  petVisual.tint = state.presentation === "petted" || state.presentation === "playing"
    ? 0xffd6e7
    : state.presentation === "working"
      ? 0xfff1b8
      : state.presentation === "ill"
        ? 0xb7d7c6
        : 0xffffff;

  workOverlay.hidden = state.activity === null;
  if (state.activity !== null) {
    const seconds = Math.max(
      0,
      Math.ceil((state.activity.durationMs - state.activity.accumulatedMs) / 1000),
    );
    workCountdown.value = `${activityLabel(state.activity)} · ${seconds}s`;
  }
}

function updateDirtyState(): void {
  const dirty = !sameFurniture(draftLayout.furniture, savedLayout.furniture);
  saveButton.disabled = !dirty || saving;
  discardButton.disabled = !dirty || saving;
  window.desktopHome.setDirty(dirty);
  if (!saving) {
    layoutStatus.classList.remove("error");
    layoutStatus.value = dirty ? "Unsaved changes" : "Layout saved";
  }
}

async function resyncPet(): Promise<void> {
  if (resyncInFlight !== null) return resyncInFlight;
  resyncInFlight = window.desktopHome
    .getSnapshot()
    .then((snapshot) => {
      currentState = readSnapshot(snapshot);
      renderState(currentState);
    })
    .finally(() => { resyncInFlight = null; });
  return resyncInFlight;
}

async function dispatch(command: PetCommand): Promise<void> {
  try {
    await window.desktopHome.dispatch(command);
  } catch (error: unknown) {
    console.error("Home pet command failed.", error);
    await resyncPet();
  }
}

async function openManagement(tab: ManagementTab): Promise<void> {
  try {
    await window.desktopHome.openManagement(tab);
  } catch (error: unknown) {
    console.error("Unable to open management from Home.", error);
  }
}

window.desktopHome.onPatch((patch) => {
  const nextState = applyPatch(currentState, patch);
  if (nextState === null) {
    void resyncPet();
    return;
  }
  currentState = nextState;
  renderState(currentState);
});

interface ScenePoint { x: number; y: number }
function scenePoint(event: PointerEvent | MouseEvent): ScenePoint {
  const bounds = pixi.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * ROOM_WIDTH,
    y: ((event.clientY - bounds.top) / bounds.height) * ROOM_HEIGHT,
  };
}

function furnitureAt(point: ScenePoint): FurniturePlacement | null {
  return draftLayout.furniture.find((item) =>
    point.x >= item.x * CELL_SIZE &&
    point.x < (item.x + item.width) * CELL_SIZE &&
    point.y >= item.y * CELL_SIZE &&
    point.y < (item.y + item.height) * CELL_SIZE,
  ) ?? null;
}

function pointIsOnPet(point: ScenePoint): boolean {
  return point.x >= PET_X - PET_HIT_WIDTH / 2 &&
    point.x <= PET_X + PET_HIT_WIDTH / 2 &&
    point.y >= PET_BOTTOM - PET_HIT_HEIGHT && point.y <= PET_BOTTOM;
}

let drag: {
  id: string;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  previous: HomeLayout;
} | null = null;
let petPointer: { pointerId: number; start: ScenePoint } | null = null;

pixi.canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const point = scenePoint(event);
  const placement = furnitureAt(point);
  if (placement !== null) {
    drag = {
      id: placement.id,
      offsetX: Math.floor(point.x / CELL_SIZE) - placement.x,
      offsetY: Math.floor(point.y / CELL_SIZE) - placement.y,
      pointerId: event.pointerId,
      previous: cloneLayout(draftLayout),
    };
    pixi.canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (pointIsOnPet(point)) {
    petPointer = { pointerId: event.pointerId, start: point };
    pixi.canvas.setPointerCapture(event.pointerId);
  }
});

pixi.canvas.addEventListener("pointermove", (event) => {
  if (drag === null || drag.pointerId !== event.pointerId) return;
  const point = scenePoint(event);
  const x = Math.floor(point.x / CELL_SIZE) - drag.offsetX;
  const y = Math.floor(point.y / CELL_SIZE) - drag.offsetY;
  draftLayout = {
    ...draftLayout,
    furniture: draftLayout.furniture.map((item) =>
      item.id === drag?.id ? { ...item, x, y } : item,
    ),
  };
  const validation = validateHomeFurniture(draftLayout.furniture);
  renderFurniture(validation.valid ? null : drag.id);
});

function finishPointer(event: PointerEvent): void {
  if (drag !== null && drag.pointerId === event.pointerId) {
    if (!validateHomeFurniture(draftLayout.furniture).valid) {
      draftLayout = drag.previous;
    }
    drag = null;
    renderFurniture();
    updateDirtyState();
    return;
  }
  if (petPointer !== null && petPointer.pointerId === event.pointerId) {
    const point = scenePoint(event);
    if (Math.hypot(point.x - petPointer.start.x, point.y - petPointer.start.y) < 8) {
      void dispatch({ type: "pet" });
    }
    petPointer = null;
  }
}
pixi.canvas.addEventListener("pointerup", finishPointer);
pixi.canvas.addEventListener("pointercancel", finishPointer);

function setStatsOpen(open: boolean): void {
  statsOpen = open;
  statsOverlay.hidden = !open;
}

pixi.canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (pointIsOnPet(scenePoint(event))) setStatsOpen(!statsOpen);
});
document.addEventListener("pointerdown", (event) => {
  if (!statsOpen || event.button !== 0 || statsOverlay.contains(event.target as Node)) return;
  if (event.target !== pixi.canvas || !pointIsOnPet(scenePoint(event))) setStatsOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && statsOpen) setStatsOpen(false);
});

saveButton.addEventListener("click", async () => {
  if (saving || sameFurniture(draftLayout.furniture, savedLayout.furniture)) return;
  saving = true;
  updateDirtyState();
  layoutStatus.value = "Saving…";
  try {
    const result = await window.desktopHome.saveLayout({
      baseVersion: savedLayout.layoutVersion,
      furniture: draftLayout.furniture,
      type: "saveHomeLayout",
    });
    savedLayout = cloneLayout(result.layout);
    draftLayout = cloneLayout(result.layout);
    renderFurniture();
  } catch (error: unknown) {
    layoutStatus.classList.add("error");
    layoutStatus.value = error instanceof Error ? error.message : "Layout could not be saved.";
  } finally {
    saving = false;
    const dirty = !sameFurniture(draftLayout.furniture, savedLayout.furniture);
    saveButton.disabled = !dirty;
    discardButton.disabled = !dirty;
    window.desktopHome.setDirty(dirty);
    if (!dirty) {
      layoutStatus.classList.remove("error");
      layoutStatus.value = "Layout saved";
    }
  }
});

discardButton.addEventListener("click", () => {
  draftLayout = cloneLayout(savedLayout);
  renderFurniture();
  updateDirtyState();
});
desktopButton.addEventListener("click", () => window.desktopHome.requestDesktop());
workMenuButton.addEventListener("click", () => void openManagement("work"));
careersMenuButton.addEventListener("click", () => void openManagement("careers"));
cancelWorkButton.addEventListener("click", () => void dispatch({ type: "cancelActivity" }));

renderState(currentState);
updateDirtyState();
window.desktopHome.ready();
