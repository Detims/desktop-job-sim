# Architecture constraints

Status: Baseline summary  
Sources: Desktop Pet SRS v1.0 and Desktop Pet SDD v1.0  
Precedence: The SRS defines product requirements; the SDD is the authoritative
initial technical design.

## Runtime and ownership

- Windows 11 is the only required initial validation platform. Cross-platform
  domain and content logic must be retained for future macOS support.
- Electron is the desktop runtime. The main process is the sole authoritative
  owner of application lifecycle, durable state, simulation time, persistence,
  privileged integrations, mod installation, updates, and window orchestration.
- Renderers are sandboxed presentation clients. Node integration is disabled,
  context isolation and sandboxing are enabled, and all renderer requests pass
  through narrow typed preload bridges with sender, payload, and authorization
  validation.
- Each pet has a sequential command queue. Inventory, mods, and settings use
  separate application-level queues. Domain rules, not arrival order alone,
  resolve conflicts.

## UI and rendering

- React is for conventional management UI. PixiJS is for sprite, pet, room, and
  furniture scenes.
- The application has three user-facing renderers: a normally open transparent
  desktop pet, a lazy single-instance pocket home, and a lazy management window.
- The SDD explicitly makes the pet window non-click-through. This overrides the
  SRS MVP table's click-through wording for the initial design.
- The first renderer supports PNG sprite sheets. GIF input is later converted
  into the same internal cached-frame representation.
- Animation selection is deterministic with explicit fallback chains. Rendering
  frame rate never drives simulation time.

## Domain, state, and time

- Domain and simulation modules must not import Electron, DOM, PixiJS, React,
  SQLite-driver, or Windows APIs. Folder and import boundaries are sufficient;
  separate workspace packages are not required.
- All mutations are typed commands processed in the main process.
- A renderer starts from a full versioned snapshot, applies patches only when
  `baseVersion` matches, and requests a full snapshot on divergence.
- Active simulation uses a one-second scheduler but computes from actual elapsed
  milliseconds. Random behavior uses a persisted seed and must be reproducible.
- Sleep is reconciled as offline time; active jobs do not continue during sleep.
  Clean exit and crash recovery settle active work proportionally.
- The SDD defines bounded offline reconciliation (default maximum 8 hours,
  default 0.5x decay). The SRS default of no punitive closed-app decay remains a
  product constraint; exact first-slice policy behavior must be covered by
  acceptance tests and presented without hidden loss.

## Persistence and content

- SQLite is main-process-only and accessed through repository interfaces.
  Durable activities include elapsed active time, pause state, and checkpoints.
- Writes are transactional. Migrations are automatic and forward-only, with a
  backup before migration and restoration on failure.
- Persistent references use stable namespaced IDs, never local asset paths.
- Rules and content are data-driven and runtime-validated with Zod and JSON
  Schema where applicable.
- General mod support is outside the first slice. Future mods remain data-only:
  no executable code, arbitrary HTML, shell commands, direct IPC, or remote
  downloads.

## Resource, security, and quality gates

- Target near-zero idle CPU when static and approximately 400 MB or less in
  normal use. Suspend PixiJS animation when static and lazy-create or destroy
  secondary renderers.
- Required Windows validation covers multiple monitors, multiple display scale
  factors, sleep/wake, lock/unlock, clean exit, crash recovery, and resource use.
- Tests span pure unit tests, domain integration tests, renderer synchronization
  tests, Electron end-to-end tests, performance tests, and security tests.
- Diagnostics are local, structured, rotated, and redacted.

## Scope gate

The first vertical slice must prove stable Windows window behavior,
deterministic simulation, SQLite persistence, pet transfer between desktop and
home, renderer resynchronization, crash/exit recovery, and acceptable resource
usage. Gmail, advanced careers, general mod support, and post-slice features may
not begin before that gate passes.
