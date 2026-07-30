# First vertical slice implementation plan

Status: Ready to begin  
Authority: SDD section 22, constrained by the SRS  
Goal: Prove the riskiest platform and architecture assumptions with one coherent
Windows 11 prototype before expanding product scope.

## Objective

Deliver one original sprite-based pet that can live on the Windows desktop,
run a deterministic minimal needs simulation and one job, persist and recover
state, transfer to a one-room pocket home, and expose minimal settings and an
activity log while meeting the architecture, security, and resource gates.

## Users / audience

- The prototype is validated for a Windows 11 desktop-pet user.
- The implementation artifacts are maintained by the solo developer and future
  open-source contributors, artists, testers, and coding agents.
- Product approval is the vertical-slice exit decision; no external provider or
  community-content stakeholder is needed in this slice.

## Requirements / in scope

1. A secure transparent, borderless, always-on-top-capable Windows pet window.
2. One original PNG sprite-sheet character rendered by PixiJS.
3. Idle, walk, petting, dragging, working, and deterministic fallback animation.
4. Click, hold-to-drag, cross-monitor movement, display-scale handling, and a
   minimum visible grab area. The initial SDD design is not click-through.
5. Hunger, thirst, mood, and energy updated by elapsed milliseconds on a
   one-second main-process scheduler.
6. One fixed-duration job with continuous stat cost, proportional cancellation
   reward, completion mastery bonus, remaining-time overlay, and Cancel.
7. SQLite persistence through repository interfaces, checkpoints, clean-exit
   settlement, crash recovery, and bounded offline reconciliation.
8. One lazy pocket-home window with one grid room, snapping furniture, safe
   commit/discard behavior, and pet transfer between desktop and home.
9. One lazy React management page for prototype settings and the activity log.
10. Snapshot/patch synchronization with monotonically increasing versions and
    full resynchronization after divergence.
11. Measurements for idle CPU, memory, scaling, multi-monitor drag, sleep/wake,
    lock/unlock, clean exit, and crash recovery.

## Non-goals

- Gmail or any other external integration.
- Advanced careers, exams, certifications, profession graphs, or autonomy.
- General mod installation, `.petpack` archives, GIF import, or creator tools.
- Multiple pets, additional rooms, stores, broad inventory, or full onboarding.
- macOS behavior, packaging, signing, notarization, or distribution updates.
- Features outside this list without an explicit scope decision.

## Assumptions and decisions

- The SDD resolves the SRS click-through conflict: the prototype pet window is
  interactive and not click-through.
- One original, repository-owned sprite sheet and minimal room/furniture assets
  are sufficient to validate rendering and interaction.
- The concrete SQLite driver and Electron packaging tool are implementation
  selections inside the SDD's allowed choices, but each must be proven on
  Windows before becoming a durable baseline.
- Balancing constants are fixture data, not hard-coded renderer behavior.

## Open risks

- Transparent Electron windows may behave differently across GPUs, monitors,
  display scales, full-screen applications, and lock/sleep transitions.
- Electron memory may exceed the target unless renderers and PixiJS frame loops
  are aggressively suspended.
- The selected SQLite driver may add Electron ABI, rebuild, signing, or
  packaging complexity.
- Wall-clock discontinuities can corrupt activity rewards unless duration logic
  uses monotonic elapsed time and explicit offline reconciliation.
- Renderer crashes or patch divergence can produce two visible pet
  presentations unless main-process transfer state is authoritative.
- The exact need rates, job duration/rewards, sprite dimensions, and furniture
  grid dimensions remain balancing or asset decisions. They must be fixture
  data and cannot change the architectural gates.

## Delivery sequence

### Milestone 0 - Foundation and contracts

- Finalize single-package build, lint, test, and packaging commands.
- Define initial `PetState`, position, animation, activity, snapshot, patch, and
  command schemas with runtime validation.
- Establish main/preload/renderer boundaries and security defaults.
- Add deterministic clock and seeded-random test fixtures.

Exit: the project compiles; boundary tests prove renderer code cannot reach Node or
mutate domain state directly.

### Milestone 1 - Windows window and one PixiJS pet

- Create the transparent pet window behind a platform-window interface.
- Render one sprite sheet with idle and static fallback.
- Add display discovery, scale conversion, position clamping, and saved anchor.
- Suspend PixiJS rendering when the scene is static.

Exit: Windows 11 shows the pet correctly at tested display scales with measured
idle behavior and no persistent dashboard.

### Milestone 2 - Interaction and animation

- Implement click, petting, hold threshold, drag state, walk, work, and fallback
  selection.
- Preserve a minimum visible grab region across monitor boundaries.
- Separate major logical activity from temporary presentation state.

Exit: automated renderer tests and manual multi-monitor tests cover drag,
petting during work presentation, fallbacks, and visibility clamping.

### Milestone 3 - Deterministic needs simulation

- Add centralized commands and a per-pet sequential queue.
- Implement hunger, thirst, mood, and energy deltas from elapsed milliseconds.
- Publish a full initial snapshot and versioned patches; force resync on mismatch.
- Cover tick batching, clock changes, lock, sleep, and pause semantics.

Exit: repeated runs from the same state, elapsed time, and seed produce identical
results without using renderer frame time.

### Milestone 4 - One complete job

- Add one data-defined job and one mastery track.
- Apply continuous costs and proportional rewards from active elapsed time.
- Add completion-only mastery bonus, interruption rules, and an independent
  pinned countdown with immediate Cancel.
- Add the lazy React management-window shell with Work and Careers tabs. The
  Work tab owns job selection/start controls; the Careers tab is limited to
  the current Student-stage summary.
- Commit results before result animation.

Exit: completion, cancellation, clean exit, sleep, and crash scenarios neither
duplicate rewards nor lose already-earned proportional progress.

### Milestone 5 - SQLite persistence and recovery

- Select and prove the Electron-compatible SQLite driver.
- Implement repository interfaces, initial schema, transaction boundaries,
  activity checkpoints, snapshots, and forward-only migration harness.
- Add bounded offline reconciliation and activity-log retention foundations.
- Back up before migration and fail closed on migration errors.

Exit: close/restart and simulated crash recover the latest committed consistent
state; corrupted or failed migration paths preserve a recoverable backup.

### Milestone 6 - Pocket home and transfer

- Create the home window lazily and render one room at a time.
- Add one grid, draggable snapping furniture, local temporary drag state, and
  authoritative commit.
- Transfer the single pet presentation between desktop and home.
- On close or renderer failure, discard uncommitted edits and safely return the
  pet to the desktop.

Exit: transfer and placement are deterministic, cancellable, recoverable, and
do not create a second pet instance.

### Milestone 7 - Minimal management page

- Extend the existing Work/Careers management window with only prototype
  settings and the 30-day activity log.
- Keep the fixed application theme and keyboard-accessible controls.
- Route all changes through validated commands.

Exit: settings persist and the activity log explains meaningful state changes
without recording every tick.

### Milestone 8 - Vertical-slice gate

- Run unit, domain integration, renderer, Electron end-to-end, performance, and
  security suites.
- Validate Windows 11 on single and multiple monitors, multiple scale factors,
  sleep/wake, lock/unlock, clean exit, and crash recovery.
- Profile the static pet and the worst normal case with all three windows open.
- Record measured CPU, memory, known platform defects, and go/no-go decision.

Exit: stable window behavior, deterministic simulation, persistence, renderer
resynchronization, pet transfer, and resource targets are proven. Otherwise,
fix or document an approved architecture change before expanding scope.

## Acceptance criteria

- A Windows 11 build displays and moves one sprite pet across monitors and scale
  factors while preserving a visible grab area.
- Durable pet and household state are owned only by the main process.
- Patch divergence causes a full snapshot resynchronization.
- Simulation results are reproducible from elapsed time and a saved seed.
- Clean exit and crash recovery settle work proportionally without duplicate
  rewards; sleep does not incorrectly complete active work.
- Pocket-home transfer maintains one pet instance and safely discards
  uncommitted furniture movement after close or failure.
- Static idle CPU is near zero and normal memory is approximately 400 MB or less,
  or a measured exception is explicitly reviewed before proceeding.
- The prototype works fully offline and contains no integration or executable
  mod surface.

## Ownership and next action

The implementation owner maintains the SDD boundary and records material
exceptions as ADRs. The immediate next build artifact is Milestone 0 followed by
the Windows transparent-window spike in Milestone 1.
