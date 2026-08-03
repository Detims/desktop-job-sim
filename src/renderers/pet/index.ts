import {
  AnimatedSprite,
  Application,
  Assets,
  Graphics,
  Rectangle,
  Texture,
} from "pixi.js";

import spriteSheetUrl from "../../../content/core/characters/prototype-cat/idle.png";
import { activityLabel } from "../../shared/activity-label.js";
import {
  type ManagementTab,
  type NeedState,
  type PetCommand,
  type PetState,
  type Presentation,
} from "../../shared/contracts.js";
import { applyPatch, readSnapshot } from "../shared/pet-store.js";
import { initializePetOverlay } from "../shared/pet-overlay.js";
import { resolveAnimation } from "./animation.js";
import "./styles.css";
import "../shared/pet-overlay.css";

const FRAME_COUNT = 4;
const DRAG_HOLD_MS = 220;
const CLICK_MOVEMENT_TOLERANCE = 6;
const availableAnimations = new Set(["idle"]);

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}

const root = requiredElement<HTMLElement>("#pet-root");
const shell = requiredElement<HTMLElement>("#pet-shell");
const statsOverlay = requiredElement<HTMLElement>("#pet-stats-overlay");
const workOverlay = requiredElement<HTMLElement>("#work-overlay");
const workCountdown = requiredElement<HTMLOutputElement>("#work-countdown");
const statusText = requiredElement<HTMLOutputElement>("#status-text");
const conditionStatus = requiredElement<HTMLElement>("#condition-status");
const walletText = requiredElement<HTMLElement>("#wallet");
const masteryText = requiredElement<HTMLElement>("#mastery");
const knowledgeText = requiredElement<HTMLElement>("#knowledge");
const walkButton = requiredElement<HTMLButtonElement>("#walk-button");
const homeButton = requiredElement<HTMLButtonElement>("#home-button");
const restButton = requiredElement<HTMLButtonElement>("#rest-button");
const workMenuButton =
  requiredElement<HTMLButtonElement>("#work-menu-button");
const careersMenuButton = requiredElement<HTMLButtonElement>(
  "#careers-menu-button",
);
const cancelWorkButton = requiredElement<HTMLButtonElement>(
  "#cancel-work-button",
);
const needElements: Readonly<Record<keyof NeedState, HTMLProgressElement>> = {
  energy: requiredElement<HTMLProgressElement>("#energy"),
  hunger: requiredElement<HTMLProgressElement>("#hunger"),
  mood: requiredElement<HTMLProgressElement>("#mood"),
  thirst: requiredElement<HTMLProgressElement>("#thirst"),
};

const pixi = new Application();
await pixi.init({
  antialias: true,
  backgroundAlpha: 0,
  height: window.innerHeight,
  preference: "webgl",
  resolution: window.devicePixelRatio,
  width: window.innerWidth,
});
// The sprite sheet is intentionally low-frame-rate pixel art. Capping the
// renderer avoids paying for 60 GPU redraws per second while the pet is idle.
pixi.ticker.maxFPS = 12;

pixi.canvas.setAttribute("aria-hidden", "true");
pixi.canvas.tabIndex = 0;
root.appendChild(pixi.canvas);

let petSprite: AnimatedSprite | null = null;
let currentState: PetState = readSnapshot(await window.desktopPet.getSnapshot());
await initializePetOverlay(window.desktopPet);
let resyncInFlight: Promise<void> | null = null;

async function addPetSprite(): Promise<void> {
  const sheet = await Assets.load<Texture>(spriteSheetUrl);
  const frameWidth = Math.floor(sheet.width / FRAME_COUNT);
  const frames = Array.from(
    { length: FRAME_COUNT },
    (_, index) =>
      new Texture({
        frame: new Rectangle(
          frameWidth * index,
          0,
          frameWidth,
          sheet.height,
        ),
        source: sheet.source,
      }),
  );
  const sprite = new AnimatedSprite(frames);
  const availableWidth = pixi.screen.width - 32;
  const availableHeight = pixi.screen.height - 82;
  const scale = Math.min(
    availableWidth / frameWidth,
    availableHeight / sheet.height,
  );

  sprite.anchor.set(0.5, 1);
  sprite.animationSpeed = 0.035;
  sprite.scale.set(scale);
  sprite.position.set(pixi.screen.width / 2, pixi.screen.height - 76);
  sprite.play();
  pixi.stage.addChild(sprite);
  petSprite = sprite;
}

function addFallbackPet(): void {
  const fallback = new Graphics()
    .circle(0, 0, 72)
    .fill({ color: 0xf59e0b })
    .circle(-26, -12, 8)
    .circle(26, -12, 8)
    .fill({ color: 0x3f2618 });

  fallback.position.set(pixi.screen.width / 2, pixi.screen.height / 2);
  pixi.stage.addChild(fallback);
}

function renderNeed(name: keyof NeedState, value: number): void {
  const element = needElements[name];
  element.value = value;
  element.title = `${name}: ${Math.round(value)} of 100`;
}

function setPresentation(presentation: Presentation): void {
  const resolved = resolveAnimation(presentation, availableAnimations);
  shell.dataset.presentation = presentation;
  shell.dataset.animation = resolved;

  if (petSprite === null) {
    return;
  }

  petSprite.tint =
    presentation === "petted"
      ? 0xffd6e7
      : presentation === "working"
        ? 0xfff1b8
        : 0xffffff;
  petSprite.scale.y =
    presentation === "petted"
      ? Math.abs(petSprite.scale.x) * 0.95
      : Math.abs(petSprite.scale.x);
}

function renderState(state: PetState): void {
  renderNeed("hunger", state.needs.hunger);
  renderNeed("thirst", state.needs.thirst);
  renderNeed("mood", state.needs.mood);
  renderNeed("energy", state.needs.energy);
  walletText.textContent = `${state.wallet.toFixed(1)}c`;
  masteryText.textContent = `${state.mastery.toFixed(1)}★`;
  knowledgeText.textContent = `${(state.knowledge["core:general"] ?? 0).toFixed(1)}K`;
  statusText.value = state.statusText;
  const discouraged = state.conditions["core:discouraged"];
  conditionStatus.hidden = discouraged === undefined;
  conditionStatus.textContent =
    discouraged === undefined
      ? ""
      : `Discouraged · ${Math.max(0, Math.ceil((discouraged.expiresAt - Date.now()) / 60_000))}m`;
  setPresentation(state.presentation);

  const hasActivity = state.activity !== null;
  walkButton.disabled = hasActivity;
  restButton.disabled = hasActivity || state.needs.energy >= 100;
  workOverlay.hidden = !hasActivity;

  if (state.activity !== null) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(
        (state.activity.durationMs - state.activity.accumulatedMs) / 1000,
      ),
    );
    workCountdown.value = `${activityLabel(state.activity)} · ${remainingSeconds}s`;
  }
}

async function resync(): Promise<void> {
  if (resyncInFlight !== null) {
    return resyncInFlight;
  }

  resyncInFlight = window.desktopPet
    .getSnapshot()
    .then((snapshot) => {
      currentState = readSnapshot(snapshot);
      renderState(currentState);
    })
    .finally(() => {
      resyncInFlight = null;
    });

  return resyncInFlight;
}

async function dispatch(command: PetCommand): Promise<void> {
  try {
    await window.desktopPet.dispatch(command);
  } catch (error: unknown) {
    console.error("Pet command failed.", error);
    await resync();
  }
}

async function openManagement(tab: ManagementTab): Promise<void> {
  try {
    await window.desktopPet.openManagement(tab);
  } catch (error: unknown) {
    console.error("Unable to open the management window.", error);
  }
}

async function openHome(): Promise<void> {
  try {
    await window.desktopPet.openHome();
  } catch (error: unknown) {
    console.error("Unable to open Home.", error);
  }
}

window.desktopPet.onPatch((patch) => {
  const nextState = applyPatch(currentState, patch);
  if (nextState === null) {
    void resync();
    return;
  }

  currentState = nextState;
  renderState(currentState);
});

try {
  await addPetSprite();
} catch (error: unknown) {
  console.error("Unable to load the prototype pet sprite.", error);
  addFallbackPet();
}

renderState(currentState);

let activePointerId: number | null = null;
let dragTimer: ReturnType<typeof setTimeout> | null = null;
let dragging = false;
let pointerStart = { x: 0, y: 0 };
let latestScreenPoint = { x: 0, y: 0 };

function clearDragTimer(): void {
  if (dragTimer !== null) {
    clearTimeout(dragTimer);
    dragTimer = null;
  }
}

function finishPointerInteraction(event: PointerEvent): void {
  if (activePointerId !== event.pointerId) {
    return;
  }

  clearDragTimer();
  const movement = Math.hypot(
    event.clientX - pointerStart.x,
    event.clientY - pointerStart.y,
  );

  if (dragging) {
    window.desktopPet.endDrag();
    shell.classList.remove("is-dragging");
  } else if (movement <= CLICK_MOVEMENT_TOLERANCE) {
    void dispatch({ type: "pet" });
  }

  activePointerId = null;
  dragging = false;
}

pixi.canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || activePointerId !== null) {
    return;
  }

  activePointerId = event.pointerId;
  pointerStart = { x: event.clientX, y: event.clientY };
  latestScreenPoint = { x: event.screenX, y: event.screenY };
  pixi.canvas.setPointerCapture(event.pointerId);
  dragTimer = setTimeout(() => {
    dragging = true;
    shell.classList.add("is-dragging");
    window.desktopPet.beginDrag(latestScreenPoint);
  }, DRAG_HOLD_MS);
});

pixi.canvas.addEventListener("pointermove", (event) => {
  if (activePointerId !== event.pointerId) {
    return;
  }

  latestScreenPoint = { x: event.screenX, y: event.screenY };
  if (dragging) {
    window.desktopPet.drag(latestScreenPoint);
  }
});

pixi.canvas.addEventListener("pointerup", finishPointerInteraction);
pixi.canvas.addEventListener("pointercancel", finishPointerInteraction);

let statsOverlayOpen = false;

function setStatsOverlayOpen(open: boolean): void {
  statsOverlayOpen = open;
  statsOverlay.hidden = !open;
  shell.classList.toggle("has-stats-overlay", open);
}

pixi.canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  setStatsOverlayOpen(!statsOverlayOpen);
});

document.addEventListener("pointerdown", (event) => {
  if (
    statsOverlayOpen &&
    event.button === 0 &&
    !statsOverlay.contains(event.target as Node)
  ) {
    setStatsOverlayOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "ContextMenu" ||
    (event.shiftKey && event.key === "F10")
  ) {
    event.preventDefault();
    setStatsOverlayOpen(!statsOverlayOpen);
    return;
  }

  if (event.key === "Escape" && statsOverlayOpen) {
    setStatsOverlayOpen(false);
    pixi.canvas.focus();
  }
});

walkButton.addEventListener("click", () => {
  void dispatch({ type: "walk" });
});
restButton.addEventListener("click", () => {
  void dispatch({ type: "startRest" });
});
homeButton.addEventListener("click", () => {
  setStatsOverlayOpen(false);
  void openHome();
});
workMenuButton.addEventListener("click", () => {
  void openManagement("work");
});
careersMenuButton.addEventListener("click", () => {
  void openManagement("careers");
});
cancelWorkButton.addEventListener("click", () => {
  void dispatch({ type: "cancelActivity" });
});

console.info("Desktop pet renderer ready.", window.desktopPet.runtime);
