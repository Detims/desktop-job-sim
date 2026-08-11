import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  EmailPrivacyMode,
  IntegrationCommand,
  IntegrationSnapshot,
} from "../../shared/integration-types.js";
import "./styles.css";

type Tab = "accounts" | "notifications";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The integration operation failed.";
}

function timeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function displayTime(value: number | null): string {
  return value === null ? "Never" : new Date(value).toLocaleString();
}

function App() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [snapshot, setSnapshot] = useState<IntegrationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.desktopIntegrations.getSnapshot().then(setSnapshot).catch((reason: unknown) => {
      setError(errorMessage(reason));
    });
    return window.desktopIntegrations.onChanged(setSnapshot);
  }, []);

  const command = useCallback(async (value: IntegrationCommand) => {
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await window.desktopIntegrations.command(value));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  const setQuiet = useCallback((input: Partial<{
    enabled: boolean;
    endMinutes: number;
    startMinutes: number;
  }>) => {
    if (snapshot === null) return;
    void command({
      baseVersion: snapshot.settings.settingsVersion,
      enabled: input.enabled ?? snapshot.settings.quietHoursEnabled,
      endMinutes: input.endMinutes ?? snapshot.settings.quietEndMinutes,
      startMinutes: input.startMinutes ?? snapshot.settings.quietStartMinutes,
      type: "setQuietHours",
    });
  }, [command, snapshot]);

  const stateLabel = snapshot === null
    ? "Loading"
    : ({
        configured: snapshot.accountEmail ?? "Connected",
        connected: snapshot.accountEmail ?? "Connected",
        connecting: "Waiting for Google",
        disconnected: "Not connected",
        error: "Unavailable",
        reauthRequired: "Reconnect required",
        unconfigured: "Google integration is not configured",
      } as const)[snapshot.connectionState];

  return (
    <main className="integrations-shell">
      <header>
        <div><p className="eyebrow">Desktop Pet</p><h1>Integrations</h1></div>
        <nav aria-label="Integration sections">
          <button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")} type="button">Accounts</button>
          <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")} type="button">Notifications</button>
        </nav>
      </header>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}
      {snapshot?.lastError !== null && snapshot?.lastError !== undefined && (
        <div className="warning-banner" role="status">{snapshot.lastError}</div>
      )}

      {tab === "accounts" ? (
        <section className="panel">
          <div className="section-heading"><div><h2>Google account</h2><p>Read-only Gmail awareness for this pet.</p></div><span className={`status ${snapshot?.connectionState ?? "loading"}`}>{stateLabel}</span></div>
          {snapshot !== null && !snapshot.configured && (
            <div className="setup-note">
              Add <code>DESKTOP_PET_GOOGLE_CLIENT_ID</code> to <code>.env.local</code>, then restart the application.
            </div>
          )}
          <dl>
            <div><dt>Last sync</dt><dd>{displayTime(snapshot?.lastSyncAt ?? null)}</dd></div>
            <div><dt>Polling</dt><dd>On startup and every 10 minutes</dd></div>
            <div><dt>Access</dt><dd>Gmail read-only</dd></div>
          </dl>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || snapshot === null || !snapshot.configured || snapshot.connectionState === "connected" || snapshot.connectionState === "connecting"}
              onClick={() => void command({ type: "connect" })}
              type="button"
            >{snapshot?.connectionState === "reauthRequired" ? "Reconnect" : "Connect Google"}</button>
            <button disabled={busy || snapshot?.connectionState !== "connected"} onClick={() => void command({ type: "refresh" })} type="button">Refresh</button>
            <button className="danger" disabled={busy || snapshot?.accountEmail === null} onClick={() => {
              if (window.confirm("Disconnect Google? Stored credentials will be removed from this computer.")) {
                void command({ type: "disconnect" });
              }
            }} type="button">Disconnect</button>
          </div>
        </section>
      ) : (
        <section className="panel settings-panel">
          <div className="section-heading"><div><h2>Mail speech bubbles</h2><p>Message content is shown transiently and never added to activity history.</p></div></div>
          <label className="field">
            <span>Privacy mode</span>
            <select
              disabled={busy || snapshot === null}
              onChange={(event) => {
                if (snapshot === null) return;
                void command({
                  baseVersion: snapshot.settings.settingsVersion,
                  privacyMode: event.target.value as EmailPrivacyMode,
                  type: "setPrivacyMode",
                });
              }}
              value={snapshot?.settings.privacyMode ?? "countOnly"}
            >
              <option value="countOnly">Count only</option>
              <option value="senderSubject">Sender + subject</option>
              <option value="shortPreview">Short preview</option>
            </select>
          </label>
          <label className="toggle-row">
            <span><strong>Quiet hours</strong><small>Defer mail and release one batch afterward.</small></span>
            <input checked={snapshot?.settings.quietHoursEnabled ?? false} disabled={busy || snapshot === null} onChange={(event) => setQuiet({ enabled: event.target.checked })} type="checkbox" />
          </label>
          <div className="time-grid">
            <label className="field"><span>Start</span><input disabled={busy || snapshot === null || !snapshot.settings.quietHoursEnabled} onChange={(event) => {
              const value = parseTime(event.target.value);
              if (value !== null) setQuiet({ startMinutes: value });
            }} type="time" value={timeValue(snapshot?.settings.quietStartMinutes ?? 1_320)} /></label>
            <label className="field"><span>End</span><input disabled={busy || snapshot === null || !snapshot.settings.quietHoursEnabled} onChange={(event) => {
              const value = parseTime(event.target.value);
              if (value !== null) setQuiet({ endMinutes: value });
            }} type="time" value={timeValue(snapshot?.settings.quietEndMinutes ?? 480)} /></label>
          </div>
          <div className="announcement-summary">
            <strong>Last announcement</strong>
            <span>{snapshot?.lastAnnouncementAt === null || snapshot === null
              ? "No mail announced yet."
              : `${snapshot.lastAnnouncementCount} message${snapshot.lastAnnouncementCount === 1 ? "" : "s"} announced at ${new Date(snapshot.lastAnnouncementAt).toLocaleTimeString()}.`}</span>
          </div>
        </section>
      )}
    </main>
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (root === null) throw new Error("Integrations root is missing.");
createRoot(root).render(<App />);
