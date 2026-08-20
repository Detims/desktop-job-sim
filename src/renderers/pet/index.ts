import { Application, Graphics } from "pixi.js";

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
import { CharacterVisualRenderer } from "../shared/character-visual.js";
import { initializeMailNotifications } from "../shared/mail-notifications.js";
import "./styles.css";
import "../shared/pet-overlay.css";

const DRAG_HOLD_MS = 220;
const CLICK_MOVEMENT_TOLERANCE = 6;

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
const homeButton = requiredElement<HTMLButtonElement>("#home-button");
const workMenuButton =
  requiredElement<HTMLButtonElement>("#work-menu-button");
const careersMenuButton = requiredElement<HTMLButtonElement>(
  "#careers-menu-button",
);
const shopWindowButton = requiredElement<HTMLButtonElement>("#shop-window-button");
const settingsWindowButton = requiredElement<HTMLButtonElement>("#settings-window-button");
const charactersWindowButton = requiredElement<HTMLButtonElement>("#characters-window-button");
const integrationsWindowButton = requiredElement<HTMLButtonElement>("#integrations-window-button");
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

let currentState: PetState = readSnapshot(await window.desktopPet.getSnapshot());
const petOverlay = await initializePetOverlay(window.desktopPet);
let resyncInFlight: Promise<void> | null = null;

const characterVisual = new CharacterVisualRenderer(pixi, {
  builtInAssetUrl: spriteSheetUrl,
  fallback: () => new Graphics()
    .circle(0, 0, 72)
    .fill({ color: 0xf59e0b })
    .circle(-26, -12, 8)
    .circle(26, -12, 8)
    .fill({ color: 0x3f2618 }),
  maxHeight: pixi.screen.height - 82,
  maxWidth: pixi.screen.width - 32,
  x: pixi.screen.width / 2,
  y: pixi.screen.height - 76,
});

function renderNeed(name: keyof NeedState, value: number): void {
  const element = needElements[name];
  element.value = value;
  element.title = `${name}: ${Math.round(value)} of 100`;
}

function setPresentation(presentation: Presentation): void {
  shell.dataset.presentation = presentation;
  shell.dataset.animation = presentation;
  characterVisual.setPresentation(presentation);

  const display = characterVisual.display;
  if (display === null) {
    return;
  }

  display.tint =
    presentation === "petted" || presentation === "playing"
      ? 0xffd6e7
      : presentation === "working"
        ? 0xfff1b8
        : presentation === "ill"
          ? 0xb7d7c6
          : 0xffffff;
  display.scale.y =
    presentation === "petted" || presentation === "playing"
      ? Math.abs(display.scale.x) * 0.95
      : Math.abs(display.scale.x);
}

function renderState(state: PetState): void {
  petOverlay.renderState(state);
  renderNeed("hunger", state.needs.hunger);
  renderNeed("thirst", state.needs.thirst);
  renderNeed("mood", state.needs.mood);
  renderNeed("energy", state.needs.energy);
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
  setPresentation(state.presentation);

  const hasActivity = state.activity !== null;
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

async function openCommerce(): Promise<void> {
  try {
    await window.desktopPet.openCommerce("shop");
  } catch (error: unknown) {
    console.error("Unable to open Shop & Inventory.", error);
  }
}

async function openSettings(): Promise<void> {
  try {
    await window.desktopPet.openSettings();
  } catch (error: unknown) {
    console.error("Unable to open Settings.", error);
  }
}

async function openCharacters(): Promise<void> {
  try {
    await window.desktopPet.openCharacters();
  } catch (error: unknown) {
    statusText.value = error instanceof Error ? error.message : "Characters could not be opened.";
  }
}

async function openIntegrations(): Promise<void> {
  try {
    await window.desktopPet.openIntegrations();
  } catch (error: unknown) {
    statusText.value = error instanceof Error ? error.message : "Integrations could not be opened.";
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
  await characterVisual.replace(await window.desktopPet.getCharacterVisual());
} catch (error: unknown) {
  console.error("Unable to load the selected pet sprite.", error);
}

window.desktopPet.onCharacterChanged((visual) => {
  void characterVisual.replace(visual).then(
    () => setPresentation(currentState.presentation),
    (error: unknown) => console.error("Unable to apply the selected character.", error),
  );
});

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

pixi.canvas.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void dispatch({ type: "pet" });
  }
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
shopWindowButton.addEventListener("click", () => void openCommerce());
settingsWindowButton.addEventListener("click", () => void openSettings());
charactersWindowButton.addEventListener("click", () => void openCharacters());
integrationsWindowButton.addEventListener("click", () => void openIntegrations());
cancelWorkButton.addEventListener("click", () => {
  void dispatch({ type: "cancelActivity" });
});

console.info("Desktop pet renderer ready.", window.desktopPet.runtime);
function applyDisplaySettings(settings: Awaited<ReturnType<typeof window.desktopPet.getSettings>>) {
  document.body.classList.toggle("quiet-mode", settings.quietMode);
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  characterVisual.setReducedMotion(settings.reducedMotion);
  pixi.ticker.maxFPS = settings.reducedMotion ? 2 : 12;
}
applyDisplaySettings(await window.desktopPet.getSettings());
window.desktopPet.onSettingsChanged(applyDisplaySettings);
void initializeMailNotifications(shell, window.desktopPet).catch((error: unknown) => {
  console.error("Mail notifications could not be initialized.", error);
});
