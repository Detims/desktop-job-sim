import type {
  ActivityPage,
  ActivityPageRequest,
  ActivityRetention,
  AppSettings,
  CareIntensity,
  MeaningfulEvent,
  UpdateSettingsCommand,
} from "../../shared/settings-activity-types.js";
import type { PetCommand, PetSnapshot, PetState } from "../../shared/pet-types.js";
import { CARE_ITEMS } from "../../domain/care-items.js";
import { hygieneBand, stressBand } from "../../domain/care.js";
import { DAILY_BOND_CAP, localDateKey } from "../../domain/relationship.js";
import {
  nextPersonalLevel,
  PERSONAL_LEVELS,
  personalLevel,
} from "../../domain/personal-growth.js";
import { PROTOTYPE_PLAY } from "../../simulation/pet-simulation.js";

type OverlayTab =
  | "activity"
  | "interact"
  | "inventory"
  | "settings"
  | "shop"
  | "status";

export interface PetOverlayBridge {
  dispatch(command: PetCommand): Promise<PetSnapshot>;
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  getSettings(): Promise<AppSettings>;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void;
  updateSettings(command: UpdateSettingsCommand): Promise<AppSettings>;
}

export interface PetOverlayController {
  renderState(state: PetState): void;
}

const CARE_LEVELS: readonly CareIntensity[] = [
  "sandbox",
  "relaxed",
  "balanced",
  "demanding",
];

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing overlay element: ${selector}`);
  return element;
}

function friendlyCareLevel(level: CareIntensity): string {
  return level[0]?.toUpperCase() + level.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

export async function initializePetOverlay(
  bridge: PetOverlayBridge,
  options: { walkEnabled?: boolean } = {},
): Promise<PetOverlayController> {
  const tabButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]"),
  );
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>("[data-overlay-panel]"),
  );
  const careSlider = requiredElement<HTMLInputElement>("#care-intensity-slider");
  const careValue = requiredElement<HTMLElement>("#care-intensity-value");
  const alwaysOnTop = requiredElement<HTMLInputElement>("#always-on-top");
  const retention = requiredElement<HTMLSelectElement>("#activity-retention");
  const settingsError = requiredElement<HTMLOutputElement>("#settings-error");
  const activityList = requiredElement<HTMLOListElement>("#activity-list");
  const activityEmpty = requiredElement<HTMLElement>("#activity-empty");
  const activityError = requiredElement<HTMLOutputElement>("#activity-error");
  const loadOlder = requiredElement<HTMLButtonElement>("#load-older-activity");
  const careError = requiredElement<HTMLOutputElement>("#care-error");
  const shopWallet = requiredElement<HTMLElement>("#shop-wallet");
  const personalLevelText = requiredElement<HTMLElement>("#personal-level");
  const generalXpText = requiredElement<HTMLElement>("#general-xp");
  const generalXpProgress = requiredElement<HTMLProgressElement>("#general-xp-progress");
  const health = requiredElement<HTMLProgressElement>("#health");
  const affection = requiredElement<HTMLProgressElement>("#affection");
  const bond = requiredElement<HTMLProgressElement>("#bond");
  const hygieneStatus = requiredElement<HTMLElement>("#hygiene-status");
  const stressStatus = requiredElement<HTMLElement>("#stress-status");
  const illnessStatus = requiredElement<HTMLElement>("#illness-status");
  const burnoutBanner = requiredElement<HTMLElement>("#burnout-banner");
  const walkButton = requiredElement<HTMLButtonElement>("#walk-button");
  const restButton = requiredElement<HTMLButtonElement>("#rest-button");
  const comfortButton = requiredElement<HTMLButtonElement>("#comfort-button");
  const petButton = requiredElement<HTMLButtonElement>("#pet-button");
  const talkButton = requiredElement<HTMLButtonElement>("#talk-button");
  const playButton = requiredElement<HTMLButtonElement>("#play-button");
  const purchaseButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-purchase-item]"),
  );
  const useButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-use-item]"),
  );
  const quantities = Array.from(
    document.querySelectorAll<HTMLElement>("[data-item-quantity]"),
  );

  let selectedTab: OverlayTab = "status";
  let settings = await bridge.getSettings();
  let activityLoaded = false;
  let loadingActivity = false;
  let nextCursor: ActivityPage["nextCursor"] | undefined;
  const events = new Map<string, MeaningfulEvent>();
  function renderCareState(state: PetState): void {
    const level = personalLevel(state.generalXp);
    const nextLevel = nextPersonalLevel(state.generalXp);
    personalLevelText.textContent = `Level ${level}`;
    generalXpText.textContent = `${state.generalXp.toFixed(1)} General XP`;
    if (nextLevel === null) {
      generalXpProgress.max = 1;
      generalXpProgress.value = 1;
      generalXpProgress.title = `Level ${level} proof maximum; ${state.generalXp.toFixed(1)} total XP`;
    } else {
      const currentThreshold =
        PERSONAL_LEVELS.find((definition) => definition.level === level)?.requiredXp ?? 0;
      generalXpProgress.max = nextLevel.requiredXp - currentThreshold;
      generalXpProgress.value = state.generalXp - currentThreshold;
      generalXpProgress.title = `${state.generalXp.toFixed(1)} / ${nextLevel.requiredXp} XP toward Level ${nextLevel.level}`;
    }
    health.value = state.care.health;
    affection.value = state.relationship.affection;
    affection.title = `Affection: ${state.relationship.affection.toFixed(1)} of 100`;
    bond.value = state.relationship.bond;
    bond.title = `Bond: ${state.relationship.bond.toFixed(1)} of 100`;
    hygieneStatus.textContent = hygieneBand(state.care.hygiene);
    stressStatus.textContent = stressBand(state.care.stress);
    const illness = state.care.seriousIllness;
    illnessStatus.hidden = illness === null;
    illnessStatus.textContent =
      illness === null
        ? ""
        : `Serious Illness · ${Math.max(0, Math.ceil((illness.recoverAt - Date.now()) / 1_000))}s`;
    const burnout = state.conditions["core:burnout"];
    burnoutBanner.hidden = burnout === undefined;
    if (burnout !== undefined) {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((burnout.expiresAt - Date.now()) / 1_000),
      );
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = String(remainingSeconds % 60).padStart(2, "0");
      burnoutBanner.textContent =
        `Burnout · ${minutes}:${seconds} · Study -25% · Rest energy -20% · ` +
        "positive Mood -25%. Rest or Play speeds recovery.";
    }
    shopWallet.textContent = `${state.household.wallet.toFixed(1)} coins`;
    walkButton.disabled =
      options.walkEnabled === false ||
      state.activity !== null ||
      state.care.seriousIllness !== null;
    restButton.disabled =
      state.activity !== null ||
      state.care.seriousIllness !== null ||
      state.needs.energy >= 100;
    comfortButton.disabled = Date.now() < state.care.comfortCooldownUntil;
    petButton.disabled = Date.now() < state.relationship.petCooldownUntil;
    talkButton.disabled = Date.now() < state.relationship.talkCooldownUntil;
    playButton.disabled =
      state.activity !== null ||
      state.care.seriousIllness !== null ||
      state.needs.energy < PROTOTYPE_PLAY.energyCost;
    for (const element of quantities) {
      const itemId = element.dataset.itemQuantity ?? "";
      element.textContent = String(state.household.inventory[itemId] ?? 0);
    }
    for (const button of purchaseButtons) {
      const item = CARE_ITEMS.find(
        (candidate) => candidate.id === button.dataset.purchaseItem,
      );
      const locked = item !== undefined && state.relationship.bond < item.requiredBond;
      const levelLocked = item !== undefined && level < item.requiredLevel;
      button.disabled =
        item === undefined || levelLocked || locked || state.household.wallet < item.price;
      button.textContent = levelLocked
        ? `Level ${item?.requiredLevel ?? 1}`
        : locked
          ? `Bond ${item?.requiredBond ?? 0}`
          : "Buy";
      button.title = levelLocked
        ? `Requires Level ${item?.requiredLevel ?? 1}`
        : locked
          ? `Requires Bond ${item?.requiredBond ?? 0}`
          : "";
    }
    for (const button of useButtons) {
      const item = CARE_ITEMS.find(
        (candidate) => candidate.id === button.dataset.useItem,
      );
      const quantity = item === undefined ? 0 : state.household.inventory[item.id] ?? 0;
      const targetFull =
        item?.action === "feed"
          ? state.needs.hunger >= 100
          : item?.action === "drink"
            ? state.needs.thirst >= 100
            : item?.action === "clean"
              ? state.care.hygiene >= 100
              : false;
      const medicineUnavailable =
        item?.action === "medicine" &&
        (state.care.seriousIllness === null || state.care.seriousIllness.medicineUsed);
      const today = localDateKey(Date.now());
      const bondUsed =
        state.relationship.bondAwardDate === "" || today > state.relationship.bondAwardDate
          ? 0
          : state.relationship.bondAwardedToday;
      const giftUnavailable =
        item?.action === "gift" &&
        state.relationship.affection >= 100 &&
        (state.relationship.bond >= 100 || bondUsed >= DAILY_BOND_CAP);
      button.disabled = quantity < 1 || targetFull || medicineUnavailable || giftUnavailable;
    }
  }

  async function dispatchCare(command: PetCommand): Promise<void> {
    careError.value = "";
    try {
      const snapshot = await bridge.dispatch(command);
      renderCareState(snapshot.state);
    } catch (error: unknown) {
      careError.value = errorMessage(error);
    }
  }

  function renderSettings(): void {
    careSlider.value = String(CARE_LEVELS.indexOf(settings.careIntensity));
    careValue.textContent = friendlyCareLevel(settings.careIntensity);
    alwaysOnTop.checked = settings.alwaysOnTop;
    retention.value = settings.activityRetention;
  }

  function setSettingsDisabled(disabled: boolean): void {
    careSlider.disabled = disabled;
    alwaysOnTop.disabled = disabled;
    retention.disabled = disabled;
  }

  function renderActivity(): void {
    const sorted = [...events.values()].sort(
      (left, right) =>
        right.occurredAt - left.occurredAt ||
        right.eventId.localeCompare(left.eventId),
    );
    activityList.replaceChildren(
      ...sorted.map((event) => {
        const item = document.createElement("li");
        const summary = document.createElement("span");
        const time = document.createElement("time");
        summary.textContent = event.summary;
        time.dateTime = new Date(event.occurredAt).toISOString();
        time.textContent = new Date(event.occurredAt).toLocaleString([], {
          dateStyle: "short",
          timeStyle: "short",
        });
        item.append(summary, time);
        return item;
      }),
    );
    activityEmpty.hidden = sorted.length > 0;
    loadOlder.hidden = nextCursor === null || !activityLoaded;
    loadOlder.disabled = loadingActivity;
  }

  async function loadActivity(reset = false): Promise<void> {
    if (loadingActivity) return;
    loadingActivity = true;
    activityError.value = "";
    if (reset) {
      events.clear();
      nextCursor = undefined;
    }
    renderActivity();
    try {
      const page = await bridge.getActivityPage({
        ...(nextCursor === undefined || nextCursor === null
          ? {}
          : { before: nextCursor }),
        limit: 100,
      });
      for (const event of page.events) events.set(event.eventId, event);
      nextCursor = page.nextCursor;
      activityLoaded = true;
    } catch (error: unknown) {
      activityError.value = errorMessage(error);
    } finally {
      loadingActivity = false;
      renderActivity();
    }
  }

  function selectTab(tab: OverlayTab): void {
    selectedTab = tab;
    for (const button of tabButtons) {
      const active = button.dataset.overlayTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.overlayPanel !== tab;
    }
    if (tab === "activity" && !activityLoaded) void loadActivity();
  }

  async function saveUpdate(command: UpdateSettingsCommand): Promise<void> {
    settingsError.value = "";
    setSettingsDisabled(true);
    try {
      settings = await bridge.updateSettings(command);
    } catch (error: unknown) {
      settingsError.value = errorMessage(error);
      try {
        settings = await bridge.getSettings();
      } catch {
        // The main process has already entered its fail-closed path.
      }
    } finally {
      renderSettings();
      setSettingsDisabled(false);
    }
  }

  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      selectTab(button.dataset.overlayTab as OverlayTab);
    });
  }
  careSlider.addEventListener("input", () => {
    const level = CARE_LEVELS[Number(careSlider.value)] ?? "balanced";
    careValue.textContent = friendlyCareLevel(level);
  });
  careSlider.addEventListener("change", () => {
    const level = CARE_LEVELS[Number(careSlider.value)] ?? "balanced";
    void saveUpdate({
      baseVersion: settings.settingsVersion,
      update: { careIntensity: level, type: "setCareIntensity" },
    });
  });
  alwaysOnTop.addEventListener("change", () => {
    void saveUpdate({
      baseVersion: settings.settingsVersion,
      update: { alwaysOnTop: alwaysOnTop.checked, type: "setAlwaysOnTop" },
    });
  });
  retention.addEventListener("change", () => {
    const value = retention.value as ActivityRetention;
    void saveUpdate({
      baseVersion: settings.settingsVersion,
      update: { activityRetention: value, type: "setActivityRetention" },
    }).then(() => {
      if (activityLoaded) void loadActivity(true);
    });
  });
  loadOlder.addEventListener("click", () => void loadActivity());
  walkButton.addEventListener("click", () => void dispatchCare({ type: "walk" }));
  restButton.addEventListener("click", () => void dispatchCare({ type: "startRest" }));
  comfortButton.addEventListener("click", () => void dispatchCare({ type: "comfort" }));
  petButton.addEventListener("click", () => void dispatchCare({ type: "pet" }));
  talkButton.addEventListener("click", () => void dispatchCare({ type: "talk" }));
  playButton.addEventListener("click", () => void dispatchCare({ type: "startPlay" }));
  for (const button of purchaseButtons) {
    button.addEventListener("click", () => {
      const itemId = button.dataset.purchaseItem;
      if (itemId !== undefined) void dispatchCare({ itemId, type: "purchaseItem" });
    });
  }
  for (const button of useButtons) {
    button.addEventListener("click", () => {
      const itemId = button.dataset.useItem;
      if (itemId !== undefined) void dispatchCare({ itemId, type: "useItem" });
    });
  }

  bridge.onSettingsChanged((next) => {
    settings = next;
    renderSettings();
  });
  bridge.onActivityEvent((event) => {
    events.set(event.eventId, event);
    if (activityLoaded) renderActivity();
  });

  renderSettings();
  selectTab(selectedTab);
  return {
    renderState(state: PetState) {
      renderCareState(state);
    },
  };
}
