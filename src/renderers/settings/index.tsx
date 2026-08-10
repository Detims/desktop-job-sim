import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  ActivityRetention,
  AppSettings,
  AutonomyMode,
  CareIntensity,
  SettingsUpdate,
} from "../../shared/settings-activity-types.js";
import "./styles.css";

const CARE_LEVELS: readonly CareIntensity[] = [
  "sandbox",
  "relaxed",
  "balanced",
  "demanding",
];

const AUTONOMY_LEVELS: readonly AutonomyMode[] = [
  "manual",
  "ownedSupplies",
  "carefulSpending",
  "independent",
];

const AUTONOMY_LABELS: Readonly<Record<AutonomyMode, string>> = {
  manual: "Manual",
  ownedSupplies: "Owned Supplies",
  carefulSpending: "Careful Spending",
  independent: "Independent",
};

const OFFLINE_REWARD_LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;

function label(value: CareIntensity): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resync = useCallback(async () => {
    try {
      setSettings(await window.desktopSettings.getSettings());
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to load settings.");
    }
  }, []);

  useEffect(() => {
    void resync();
    return window.desktopSettings.onSettingsChanged(setSettings);
  }, [resync]);

  const update = useCallback(async (change: SettingsUpdate) => {
    if (settings === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await window.desktopSettings.updateSettings({
        baseVersion: settings.settingsVersion,
        update: change,
      }));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Setting could not be saved.");
      await resync();
    } finally {
      setSaving(false);
    }
  }, [resync, saving, settings]);

  if (settings === null) {
    return <main className="loading">{error ?? "Loading settings…"}</main>;
  }

  return (
    <main className="settings-shell">
      <header><p className="eyebrow">Desktop Pet</p><h1>Settings</h1></header>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}
      <section className="settings-card">
        <div className="setting-heading">
          <div><h2>Care intensity</h2><p>Controls online need decay. Offline decay remains half this rate.</p></div>
          <strong>{label(settings.careIntensity)}</strong>
        </div>
        <input
          aria-label="Care intensity"
          disabled={saving}
          max="3"
          min="0"
          onChange={(event) => {
            const careIntensity = CARE_LEVELS[Number(event.currentTarget.value)] ?? "balanced";
            void update({ careIntensity, type: "setCareIntensity" });
          }}
          step="1"
          type="range"
          value={CARE_LEVELS.indexOf(settings.careIntensity)}
        />
        <div className="markers" aria-hidden="true">
          {CARE_LEVELS.map((level) => <span key={level}>{label(level)}</span>)}
        </div>
        <div className="setting-divider" />
        <div className="setting-heading">
          <div><h2>Autonomy</h2><p>Controls online self-care, essential spending, and safe subsistence work.</p></div>
          <strong>{AUTONOMY_LABELS[settings.autonomyMode]}</strong>
        </div>
        <input
          aria-label="Autonomy mode"
          disabled={saving}
          max="3"
          min="0"
          onChange={(event) => {
            const autonomyMode = AUTONOMY_LEVELS[Number(event.currentTarget.value)] ?? "manual";
            void update({ autonomyMode, type: "setAutonomyMode" });
          }}
          step="1"
          type="range"
          value={AUTONOMY_LEVELS.indexOf(settings.autonomyMode)}
        />
        <div className="markers autonomy-markers" aria-hidden="true">
          {AUTONOMY_LEVELS.map((mode) => <span key={mode}>{AUTONOMY_LABELS[mode]}</span>)}
        </div>
        <label className="setting-row">
          <span><strong>Protected coin reserve</strong><small>Essential care spends below this only during a critical need or Serious Illness.</small></span>
          <input
            aria-label="Protected coin reserve"
            disabled={saving}
            max="1000"
            min="0"
            onChange={(event) => void update({ autonomyReserve: Number(event.currentTarget.value), type: "setAutonomyReserve" })}
            step="1"
            type="number"
            value={settings.autonomyReserve}
          />
        </label>
        <label className="setting-row">
          <span><strong>Offline autonomy</strong><small>Allow the selected autonomy mode to provide bounded care while the app is closed.</small></span>
          <input
            checked={settings.offlineAutonomyEnabled}
            disabled={saving}
            onChange={(event) => void update({ offlineAutonomyEnabled: event.currentTarget.checked, type: "setOfflineAutonomyEnabled" })}
            type="checkbox"
          />
        </label>
        <div className="setting-heading offline-rewards-heading">
          <div><h2>Offline work rewards</h2><p>Applies to coins, General XP, mastery, and completion bonuses.</p></div>
          <strong>{settings.offlineRewardMultiplier * 100}%</strong>
        </div>
        <input
          aria-label="Offline work rewards"
          disabled={saving}
          max="4"
          min="0"
          onChange={(event) => {
            const offlineRewardMultiplier = OFFLINE_REWARD_LEVELS[Number(event.currentTarget.value)] ?? 0.5;
            void update({ offlineRewardMultiplier, type: "setOfflineRewardMultiplier" });
          }}
          step="1"
          type="range"
          value={OFFLINE_REWARD_LEVELS.indexOf(settings.offlineRewardMultiplier as typeof OFFLINE_REWARD_LEVELS[number])}
        />
        <div className="markers offline-reward-markers" aria-hidden="true">
          {OFFLINE_REWARD_LEVELS.map((value) => <span key={value}>{value * 100}%</span>)}
        </div>
        <label className="setting-row">
          <span><strong>Always on top</strong><small>Keep the desktop pet above ordinary windows.</small></span>
          <input
            checked={settings.alwaysOnTop}
            disabled={saving}
            onChange={(event) => void update({ alwaysOnTop: event.currentTarget.checked, type: "setAlwaysOnTop" })}
            type="checkbox"
          />
        </label>
        <label className="setting-row">
          <span><strong>Activity history</strong><small>Choose how long routine Activity entries are retained.</small></span>
          <select
            disabled={saving}
            onChange={(event) => void update({ activityRetention: event.currentTarget.value as ActivityRetention, type: "setActivityRetention" })}
            value={settings.activityRetention}
          >
            <option value="thirtyDays">30 days</option>
            <option value="indefinite">Keep indefinitely</option>
          </select>
        </label>
      </section>
      <p className="save-state" aria-live="polite">{saving ? "Saving…" : "Changes apply immediately."}</p>
    </main>
  );
}

const root = document.querySelector("#root");
if (root === null) throw new Error("Settings root was not found.");
createRoot(root).render(<App />);
