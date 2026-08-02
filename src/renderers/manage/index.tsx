import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import prototypeJob from "../../../content/core/jobs/prototype-job.json" with {
  type: "json",
};
import prototypeStudy from "../../../content/core/activities/study.json" with {
  type: "json",
};
import clerkCareer from "../../../content/core/careers/clerk.json" with {
  type: "json",
};
import auditRecords from "../../../content/core/jobs/audit-records.json" with {
  type: "json",
};
import organizeMail from "../../../content/core/jobs/organize-mail.json" with {
  type: "json",
};
import processForms from "../../../content/core/jobs/process-forms.json" with {
  type: "json",
};
import { activityLabel } from "../../shared/activity-label.js";
import type {
  ManagementTab,
  PetCommand,
  PetState,
} from "../../shared/pet-types.js";
import { applyPatch, readSnapshot } from "../shared/pet-store.js";
import "./styles.css";

const clerkJobs = [organizeMail, processForms, auditRecords] as const;

function clerkRankIndex(rankId: string): number {
  return clerkCareer.ranks.findIndex((rank) => rank.id === rankId);
}

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
  openCareers,
  state,
}: {
  dispatch(command: PetCommand): Promise<void>;
  openCareers(): void;
  state: PetState;
}) {
  const activity = state.activity;
  const generalKnowledge = state.knowledge["core:general"] ?? 0;
  const progress =
    activity === null
      ? 0
      : Math.min(100, (activity.accumulatedMs / activity.durationMs) * 100);
  const remainingSeconds =
    activity === null
      ? 0
      : Math.max(
          0,
          Math.ceil(
            (activity.durationMs - activity.accumulatedMs) / 1000,
          ),
        );
  const canStart = activity === null && state.needs.energy >= 10;
  const moodMultiplier = 0.75 + state.needs.mood / 200;
  const deskMultiplier = 0.05;
  const expectedStudyGain =
    prototypeStudy.rewardKnowledge * (moodMultiplier + deskMultiplier);
  const clerk = state.careers[clerkCareer.id];

  return (
    <section className="tab-panel" aria-labelledby="work-tab">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Activities</p>
          <h2>Work &amp; Study</h2>
        </div>
        <span className={activity === null ? "status idle" : "status active"}>
          {activity === null ? "Available" : activityLabel(activity)}
        </span>
      </header>

      <p className="description">
        Choose one major activity at a time. Progress is earned continuously,
        and cancellation keeps the amount already earned.
      </p>

      {activity !== null && (
        <div className="activity-card">
          <div className="activity-line">
            <span>{activityLabel(activity)}</span>
            <strong>{remainingSeconds}s remaining</strong>
          </div>
          <progress value={progress} max="100" />
          <div className="activity-line earnings">
            <span>{state.wallet.toFixed(1)} coins</span>
            <span>{state.mastery.toFixed(1)} mastery</span>
            {clerk !== undefined && (
              <span>{clerk.mastery.toFixed(1)} Clerk XP</span>
            )}
            <span>{generalKnowledge.toFixed(1)} knowledge</span>
          </div>
          <div className="actions compact">
            <button
              className="danger"
              onClick={() => void dispatch({ type: "cancelActivity" })}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <article className="work-category">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Student</p>
            <h2>{prototypeStudy.name}</h2>
          </div>
          <span className="status idle">General Knowledge</span>
        </header>
        <p className="description">
          Build broad foundational knowledge. Mood changes the gain rate, and
          the saved desk contributes an additive five-percent passive bonus.
        </p>
        <div className="metric-grid">
          <article><span>Duration</span><strong>15 sec</strong></article>
          <article><span>Base knowledge</span><strong>10</strong></article>
          <article><span>Current result</span><strong>{expectedStudyGain.toFixed(1)}</strong></article>
          <article><span>Cost</span><strong>5 energy / 2 mood</strong></article>
        </div>
        <div className="requirements">
          <h3>Requirements and effects</h3>
          <ul>
            <li className={state.needs.energy >= 10 ? "met" : "unmet"}>
              At least 10 energy ({Math.round(state.needs.energy)} available)
            </li>
            <li>Mood multiplier: {moodMultiplier.toFixed(2)}×</li>
            <li>Saved desk: +0.05 additive multiplier</li>
            <li>No completion-only bonus</li>
          </ul>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={!canStart}
            onClick={() => void dispatch({ type: "startStudy" })}
            type="button"
          >
            Start study
          </button>
        </div>
      </article>

      <article className="work-category">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Part-Time Jobs</p>
            <h2>{prototypeJob.name}</h2>
          </div>
          <span className="status idle">Student job</span>
        </header>
        <p className="description">
          A short student job that earns proportional coins and mastery, plus
          its existing completion-only mastery bonus.
        </p>
        <div className="metric-grid">
          <article><span>Duration</span><strong>15 sec</strong></article>
          <article><span>Coins</span><strong>{prototypeJob.rewardCoins}</strong></article>
          <article><span>Mastery</span><strong>{prototypeJob.rewardMastery} + {prototypeJob.completionMasteryBonus}</strong></article>
          <article><span>Energy cost</span><strong>{prototypeJob.needCosts.energy}</strong></article>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={!canStart}
            onClick={() => void dispatch({ type: "startJob" })}
            type="button"
          >
            Start work
          </button>
        </div>
      </article>

      {clerk === undefined ? (
        <article className="work-category locked-career">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Career Jobs</p>
              <h2>Clerk</h2>
            </div>
            <span className="status locked">Career locked</span>
          </header>
          <p className="description">
            Join the Clerk career before its ranked jobs appear here. Career
            enrollment is managed in Careers.
          </p>
          <div className="actions">
            <button className="secondary" onClick={openCareers} type="button">
              Go to Careers
            </button>
          </div>
        </article>
      ) : (
        <article className="work-category">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Career Jobs</p>
              <h2>Clerk Office</h2>
            </div>
            <span className="status idle">
              {clerkCareer.ranks[clerkRankIndex(clerk.rankId)]?.name}
            </span>
          </header>
          <p className="description">
            Clerk jobs award proportional coins and Clerk XP. Previously
            unlocked jobs remain available after ranking up.
          </p>
          <div className="job-list">
            {clerkJobs.map((job) => {
              const requiredRank = clerkCareer.ranks.find(
                (rank) => rank.id === job.requiredRankId,
              );
              const unlocked =
                clerkRankIndex(clerk.rankId) >=
                clerkRankIndex(job.requiredRankId);
              return (
                <article className={unlocked ? "job-card" : "job-card locked"} key={job.id}>
                  <div>
                    <p className="eyebrow">{requiredRank?.name}</p>
                    <h3>{job.name}</h3>
                    <p>
                      {job.durationMs / 1000}s · {job.rewardCoins} coins · {job.rewardCareerXp} Clerk XP
                    </p>
                    {!unlocked && <small>Requires {requiredRank?.name}</small>}
                  </div>
                  <button
                    className="primary"
                    disabled={!unlocked || !canStart}
                    onClick={() => void dispatch({ jobId: job.id, type: "startCareerJob" })}
                    type="button"
                  >
                    {unlocked ? "Start job" : "Locked"}
                  </button>
                </article>
              );
            })}
          </div>
        </article>
      )}
    </section>
  );
}

function CareersTab({
  dispatch,
  state,
}: {
  dispatch(command: PetCommand): Promise<void>;
  state: PetState;
}) {
  const generalKnowledge =
    state.knowledge[clerkCareer.enrollmentKnowledge.fieldId] ?? 0;
  const clerk = state.careers[clerkCareer.id];
  const canEnroll =
    clerk === undefined &&
    generalKnowledge >= clerkCareer.enrollmentKnowledge.minimum;
  const currentRankIndex = clerk === undefined ? -1 : clerkRankIndex(clerk.rankId);
  const currentRank = clerkCareer.ranks[currentRankIndex];
  const nextRank = clerkCareer.ranks[currentRankIndex + 1];

  return (
    <section className="tab-panel" aria-labelledby="careers-tab">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Career path</p>
          <h2>Clerk</h2>
        </div>
        <span className={clerk === undefined ? "status locked" : "status active"}>
          {currentRank?.name ?? "Not started"}
        </span>
      </header>

      <p className="description">
        Build General Knowledge, join the Clerk career, then earn separate
        Clerk XP through ranked office jobs.
      </p>

      <div className="career-summary">
        <article>
          <span>General Knowledge</span>
          <strong>{generalKnowledge.toFixed(1)}</strong>
        </article>
        <article>
          <span>Clerk XP</span>
          <strong>{(clerk?.mastery ?? 0).toFixed(1)}</strong>
        </article>
        <article>
          <span>Current rank</span>
          <strong>{currentRank?.name ?? "None"}</strong>
        </article>
      </div>

      {clerk === undefined ? (
        <div className="career-action">
          <div>
            <h3>Start the Clerk career</h3>
            <p>
              Requires {clerkCareer.enrollmentKnowledge.minimum} General Knowledge
              ({generalKnowledge.toFixed(1)} earned).
            </p>
          </div>
          <button
            className="primary"
            disabled={!canEnroll}
            onClick={() => void dispatch({ careerId: clerkCareer.id, type: "enrollCareer" })}
            type="button"
          >
            Start Career
          </button>
        </div>
      ) : (
        <>
          <div className="rank-ladder">
            {clerkCareer.ranks.map((rank, index) => (
              <article className={index <= currentRankIndex ? "rank-card reached" : "rank-card"} key={rank.id}>
                <span>{rank.advancement === "promotion" ? "Promotion" : rank.advancement === "automatic" ? "Automatic" : "Joined"}</span>
                <strong>{rank.name}</strong>
                <small>{rank.requiredMastery} XP · {rank.requiredKnowledge} knowledge</small>
              </article>
            ))}
          </div>
          {nextRank !== undefined && (
            <div className="career-action">
              <div>
                <h3>{clerk.promotionReadyAt === null ? `Next: ${nextRank.name}` : `${nextRank.name} promotion ready`}</h3>
                <p>
                  {clerk.mastery.toFixed(1)} / {nextRank.requiredMastery} Clerk XP · {generalKnowledge.toFixed(1)} / {nextRank.requiredKnowledge} knowledge
                </p>
              </div>
              {nextRank.advancement === "promotion" && (
                <button
                  className="primary"
                  disabled={clerk.promotionReadyAt === null}
                  onClick={() => void dispatch({ careerId: clerkCareer.id, type: "promoteCareer" })}
                  type="button"
                >
                  Promote
                </button>
              )}
            </div>
          )}
        </>
      )}
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
        <WorkTab
          dispatch={dispatch}
          openCareers={() => setActiveTab("careers")}
          state={state}
        />
      ) : (
        <CareersTab dispatch={dispatch} state={state} />
      )}
    </main>
  );
}

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Management renderer root was not found.");
}

createRoot(root).render(<App />);
