import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import prototypeJob from "../../../content/core/jobs/prototype-job.json" with {
  type: "json",
};
import type {
  ManagementTab,
  PetCommand,
  PetState,
} from "../../shared/pet-types.js";
import { applyPatch, readSnapshot } from "../shared/pet-store.js";
import "./styles.css";

function usePetState() {
  const [state, setState] = useState<PetState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resync = useCallback(async () => {
    try {
      const snapshot = await window.desktopManagement.getSnapshot();
      setState(readSnapshot(snapshot));
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to load pet.");
    }
  }, []);

  useEffect(() => {
    void resync();
    return window.desktopManagement.onPatch((patch) => {
      setState((current) => {
        if (current === null) {
          void resync();
          return current;
        }

        const next = applyPatch(current, patch);
        if (next === null) {
          void resync();
          return current;
        }

        return next;
      });
    });
  }, [resync]);

  const dispatch = useCallback(
    async (command: PetCommand) => {
      try {
        await window.desktopManagement.dispatch(command);
        setError(null);
      } catch (reason: unknown) {
        setError(
          reason instanceof Error ? reason.message : "Pet command failed.",
        );
        await resync();
      }
    },
    [resync],
  );

  return { dispatch, error, state };
}

function WorkTab({
  dispatch,
  state,
}: {
  dispatch(command: PetCommand): Promise<void>;
  state: PetState;
}) {
  const activity = state.activity;
  const progress =
    activity === null
      ? 0
      : Math.min(100, (activity.accumulatedMs / activity.durationMs) * 100);
  const remainingSeconds =
    activity === null
      ? Math.ceil(prototypeJob.durationMs / 1000)
      : Math.max(
          0,
          Math.ceil(
            (activity.durationMs - activity.accumulatedMs) / 1000,
          ),
        );
  const canStart = activity === null && state.needs.energy >= 10;

  return (
    <section className="tab-panel" aria-labelledby="work-tab">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Available work</p>
          <h2>{prototypeJob.name}</h2>
        </div>
        <span className={activity === null ? "status idle" : "status active"}>
          {activity === null ? "Available" : "In progress"}
        </span>
      </header>

      <p className="description">
        A short student job used to build foundational work habits and mastery.
        Rewards are earned continuously; completion grants an extra mastery
        bonus.
      </p>

      <div className="metric-grid">
        <article>
          <span>Duration</span>
          <strong>{Math.ceil(prototypeJob.durationMs / 1000)} sec</strong>
        </article>
        <article>
          <span>Coins</span>
          <strong>{prototypeJob.rewardCoins}</strong>
        </article>
        <article>
          <span>Mastery</span>
          <strong>
            {prototypeJob.rewardMastery} +{" "}
            {prototypeJob.completionMasteryBonus}
          </strong>
        </article>
        <article>
          <span>Energy cost</span>
          <strong>{prototypeJob.needCosts.energy}</strong>
        </article>
      </div>

      {activity !== null && (
        <div className="activity-card">
          <div className="activity-line">
            <span>Current progress</span>
            <strong>{remainingSeconds}s remaining</strong>
          </div>
          <progress value={progress} max="100" />
          <div className="activity-line earnings">
            <span>{state.wallet.toFixed(1)} coins</span>
            <span>{state.mastery.toFixed(1)} mastery</span>
          </div>
        </div>
      )}

      <div className="requirements">
        <h3>Requirements and effects</h3>
        <ul>
          <li className={state.needs.energy >= 10 ? "met" : "unmet"}>
            At least 10 energy ({Math.round(state.needs.energy)} available)
          </li>
          <li>
            Costs {prototypeJob.needCosts.hunger} food,{" "}
            {prototypeJob.needCosts.thirst} water,{" "}
            {prototypeJob.needCosts.mood} mood, and{" "}
            {prototypeJob.needCosts.energy} energy over the full job
          </li>
          <li>Cancellation keeps proportional rewards already earned</li>
        </ul>
      </div>

      <div className="actions">
        {activity === null ? (
          <button
            className="primary"
            disabled={!canStart}
            onClick={() => void dispatch({ type: "startJob" })}
            type="button"
          >
            Start work
          </button>
        ) : (
          <button
            className="danger"
            onClick={() => void dispatch({ type: "cancelJob" })}
            type="button"
          >
            Cancel work
          </button>
        )}
      </div>
    </section>
  );
}

function CareersTab({ state }: { state: PetState }) {
  return (
    <section className="tab-panel" aria-labelledby="careers-tab">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Current path</p>
          <h2>Student</h2>
        </div>
        <span className="status idle">Foundation</span>
      </header>

      <p className="description">
        The prototype pet begins as a student. Work mastery contributes to
        future career readiness, but advanced professions and exams are not part
        of this vertical slice.
      </p>

      <div className="career-summary">
        <article>
          <span>Total mastery</span>
          <strong>{state.mastery.toFixed(1)}</strong>
        </article>
        <article>
          <span>Current activity</span>
          <strong>{state.activity === null ? "None" : prototypeJob.name}</strong>
        </article>
        <article>
          <span>Career stage</span>
          <strong>Student</strong>
        </article>
      </div>

      <aside className="future-note">
        Career branches, qualifications, exams, and profession rewards will be
        introduced only after the current vertical-slice gate passes.
      </aside>
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<ManagementTab>("work");
  const { dispatch, error, state } = usePetState();

  useEffect(
    () => window.desktopManagement.onTabRequested(setActiveTab),
    [],
  );

  if (state === null) {
    return (
      <main className="loading">
        {error === null ? "Loading pet state…" : error}
      </main>
    );
  }

  return (
    <main className="management-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Desktop Pet</p>
          <h1>Work &amp; Careers</h1>
        </div>
        <div className="account-summary">
          <span>{state.wallet.toFixed(1)} coins</span>
          <span>{state.mastery.toFixed(1)} mastery</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Management sections">
        {(["work", "careers"] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "selected" : ""}
            id={`${tab}-tab`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {tab === "work" ? "Work" : "Careers"}
          </button>
        ))}
      </nav>

      {error !== null && <div className="error-banner">{error}</div>}
      {activeTab === "work" ? (
        <WorkTab dispatch={dispatch} state={state} />
      ) : (
        <CareersTab state={state} />
      )}
    </main>
  );
}

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Management renderer root was not found.");
}

createRoot(root).render(<App />);
