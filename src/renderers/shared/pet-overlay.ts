import type {
  ActivityPage,
  ActivityPageRequest,
  ActivityRetention,
  AppSettings,
  CareIntensity,
  MeaningfulEvent,
  UpdateSettingsCommand,
} from "../../shared/settings-activity-types.js";

type OverlayTab = "activity" | "settings" | "status";

export interface PetOverlayBridge {
  getActivityPage(request: ActivityPageRequest): Promise<ActivityPage>;
  getSettings(): Promise<AppSettings>;
  onActivityEvent(listener: (event: MeaningfulEvent) => void): () => void;
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void;
  updateSettings(command: UpdateSettingsCommand): Promise<AppSettings>;
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
): Promise<void> {
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

  let selectedTab: OverlayTab = "status";
  let settings = await bridge.getSettings();
  let activityLoaded = false;
  let loadingActivity = false;
  let nextCursor: ActivityPage["nextCursor"] | undefined;
  const events = new Map<string, MeaningfulEvent>();

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
}
