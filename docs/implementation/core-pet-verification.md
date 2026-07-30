# Core pet implementation and verification

- Status: Implemented and verified in-session
- Date: 2026-07-30
- Scope: Vertical-slice milestones 2-4, excluding persistence-dependent recovery

## Objective

Prove the pet's direct interaction, deterministic visible-needs simulation,
versioned renderer synchronization, one complete timed-job loop, and the
minimal Work/Careers management boundary before adding SQLite or broader
subsystems.

## Implemented

- Four-frame PixiJS idle animation from the original prototype sprite sheet.
- Deterministic fallback resolution from petted, dragged, walking, and working
  presentations to available animation assets.
- Click-to-pet with temporary presentation and mood improvement.
- Hold-to-drag after 220 milliseconds using validated preload IPC.
- Native-window clamping across display work areas with a 48-pixel minimum
  visible grab region.
- Main-process-owned hunger, thirst, mood, energy, wallet, mastery, activity,
  presentation, and state version.
- Sequential per-pet command processing.
- One-second scheduler using measured elapsed milliseconds.
- Suspend/resume handling that prevents active job time from advancing while
  the computer sleeps.
- Full initial snapshot, monotonically versioned patches, and full resync on
  version divergence.
- Right-click stats overlay with needs, status, wallet, mastery, Walk, and
  shortcuts to larger subsystems; click-outside and Escape dismiss it.
- Independent pinned work overlay with remaining time and immediate Cancel.
- Lazy, single-instance React management window with Work and Careers tabs.
- Work tab with the prototype job, requirements, live progress, Start, and
  Cancel; Careers tab with only the current Student-stage summary.
- Data-defined 15-second job with continuous need costs, proportional coins and
  mastery, cancellation retention, and a completion-only mastery bonus.

## Automated verification

- 6 test files and 19 tests pass.
- Tests cover sequential commands, deterministic tick batching, proportional
  cancellation rewards, single completion bonus, need clamping, patch ordering,
  divergence handling, malformed snapshots, temporary presentation recovery,
  animation fallbacks, initial display placement, and visible-grab clamping.
- Strict TypeScript typechecking passes.
- Electron main, two self-contained sandboxed preloads, PixiJS pet renderer,
  and React management renderer production builds pass.
- npm audit reports zero known vulnerabilities.

## Native Windows verification

- The transparent 360 x 320 Electron window opened with a valid native handle.
- Hover alone left the stats overlay hidden.
- Right-click opened the stats overlay and click-outside dismissed it.
- Work opened the management window on its Work tab; Careers reused the same
  window instance and selected its Careers tab.
- Starting work in the management window displayed the pinned pet countdown.
- During active work, the stats and work overlays were visible simultaneously.
- Pet-side Cancel immediately removed the work overlay and synchronized the
  management view back to idle.
- Work displayed a live remaining-time overlay and continuous rewards.
- Approximately two seconds into work, the UI showed 1.6 coins and 0.7 mastery.
- Full completion showed 12.0 coins and 7.0 mastery, including the two-point
  completion bonus.
- Hold-to-drag moved the native window from `(2176, 1096)` to `(2076, 1026)`.
- Main-process working set during the interaction run was approximately 91 MB.
  This is not a total multi-process memory measurement.

## Deliberate gaps

- State is in-memory and resets on close.
- Clean-exit settlement, crash recovery, restart recovery, checkpoints, schema
  migrations, and bounded offline reconciliation require the SQLite milestone.
- Physical validation on multiple monitors and display scale factors remains a
  Windows test-matrix task; the boundary math is unit-tested.
- Only the idle sprite frames exist. Working, walking, petting, and dragging use
  deterministic presentation effects and idle/static fallbacks.
- Pocket home, integrations, advanced careers, and general mod support remain
  out of scope. The Careers tab intentionally exposes only the Student-stage
  prototype summary.

## Next build artifact

Implement SQLite-backed repository interfaces, activity checkpoints, clean-exit
settlement, restart recovery, migrations with backup, and bounded offline
reconciliation before expanding the feature surface.
