import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  AppSettings,
  AutonomyMode,
  CareIntensity,
} from "../../shared/settings-activity-types.js";
import "./styles.css";

interface Preset {
  autonomyMode: AutonomyMode;
  careIntensity: CareIntensity;
  description: string;
  name: string;
}

const PRESETS: readonly Preset[] = [
  { autonomyMode: "manual", careIntensity: "balanced", description: "You make every care decision.", name: "Hands-on" },
  { autonomyMode: "ownedSupplies", careIntensity: "relaxed", description: "Slower needs and automatic use of owned essentials.", name: "Relaxed helper" },
  { autonomyMode: "carefulSpending", careIntensity: "balanced", description: "Balanced needs with protected essential spending.", name: "Balanced" },
  { autonomyMode: "independent", careIntensity: "balanced", description: "Full basic self-care within the protected coin reserve.", name: "Independent" },
];

function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [petName, setPetName] = useState("");
  const [presetIndex, setPresetIndex] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.desktopSettings.getSettings().then(setSettings).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Onboarding could not be loaded.");
    });
  }, []);

  async function finish() {
    const preset = PRESETS[presetIndex];
    if (settings === null || preset === undefined || saving) return;
    if (petName.trim().length === 0) {
      setError("Enter a name for your pet.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.desktopSettings.completeOnboarding({
        autonomyMode: preset.autonomyMode,
        baseVersion: settings.settingsVersion,
        careIntensity: preset.careIntensity,
        petName,
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Onboarding could not be saved.");
      setSaving(false);
    }
  }

  return (
    <main>
      <header><span className="eyebrow">Welcome</span><h1>Meet your desktop companion</h1><p>Create a local pet profile. Integrations are optional and stay disabled.</p></header>
      {error !== null && <div className="error" role="alert">{error}</div>}
      <section aria-labelledby="identity-heading">
        <h2 id="identity-heading">1. Name and character</h2>
        <div className="identity">
          <label>Pet name<input autoFocus maxLength={40} onChange={(event) => setPetName(event.currentTarget.value)} placeholder="Mochi" value={petName} /></label>
          <div className="character" aria-label="Selected character"><span aria-hidden="true">🐈</span><strong>Prototype Cat</strong><small>Built-in character</small></div>
        </div>
      </section>
      <section aria-labelledby="preset-heading">
        <h2 id="preset-heading">2. Choose a care preset</h2>
        <div className="presets">
          {PRESETS.map((preset, index) => (
            <label className={presetIndex === index ? "preset selected" : "preset"} key={preset.name}>
              <input checked={presetIndex === index} name="preset" onChange={() => setPresetIndex(index)} type="radio" />
              <strong>{preset.name}</strong><small>{preset.description}</small>
            </label>
          ))}
        </div>
      </section>
      <footer><p>You can change care and autonomy later in Settings.</p><button disabled={settings === null || saving} onClick={() => void finish()}>{saving ? "Creating…" : "Create pet"}</button></footer>
    </main>
  );
}

const root = document.querySelector("#root");
if (root === null) throw new Error("Onboarding root was not found.");
createRoot(root).render(<App />);
