# ADR-001: Electron + TypeScript + React + PixiJS

- Status: Accepted
- Date: 2026-07-29
- Scope: Initial architecture and first vertical slice
- Sources: Desktop Pet SRS v1.0; Desktop Pet SDD v1.0

## Context

The product needs Windows desktop-window behavior, transparent sprite rendering,
conventional management screens, cross-platform potential, strong process
isolation, deterministic testable domain logic, and a workflow sustainable by a
solo developer whose strongest relevant skills are TypeScript, React, and
Electron.

The riskiest assumptions are transparent multi-monitor window behavior,
resource use, renderer recovery, and separation between privileged durable state
and presentation. The stack must validate these early without coupling the
simulation to a UI framework.

## Decision

Use the following stack and boundaries:

- Electron is the desktop runtime and window/lifecycle host.
- TypeScript is the language for the main process, preload, renderers, shared
  contracts, domain packages, tests, and primary tooling.
- React is used for conventional management UI, beginning with settings and the
  activity log.
- PixiJS is used for the desktop pet and pocket-home sprite scenes.
- Vite builds renderer and Electron entry points.
- Zod-backed contracts validate IPC commands, snapshots, and patches at runtime;
  distributable content schemas may also emit JSON Schema.
- SQLite is accessed only by the main process through repository interfaces.
- Vitest covers pure and domain integration tests; Playwright-based Electron
  end-to-end coverage is introduced when the window spike becomes runnable.
- npm manages a single root package. Source boundaries remain ordinary folders;
  see ADR-002.

The Electron main process is authoritative. Renderers are sandboxed,
`nodeIntegration` is disabled, `contextIsolation` and sandboxing are enabled,
and preload exposes only narrow validated operations. React and PixiJS do not
own durable domain state.

The pet renderer uses PixiJS directly for its scene and only minimal trusted DOM
for accessible controls or overlays. The home renderer follows the same scene
boundary. React is not inserted into sprite-scene ownership merely for stack
uniformity.

The SDD's non-click-through pet-window constraint governs the initial slice,
despite conflicting wording in the SRS MVP table. Platform-specific Electron and
Windows behavior is isolated behind main-process interfaces.

Electron Forge versus electron-builder is intentionally not decided by this
ADR because the SDD permits either. The window spike will select the smallest
toolchain that proves Vite compatibility, native SQLite packaging, Windows
artifacts, and future updater/signing needs; that selection must be recorded if
it materially changes this baseline.

## Consequences

### Positive

- One language and shared runtime contracts reduce solo-development overhead.
- React handles forms, settings, logs, and accessibility with familiar patterns.
- PixiJS provides efficient sprite and room rendering without forcing domain
  state into a game engine.
- Main-process authority makes persistence, conflict resolution, offline
  reconciliation, and crash recovery testable and auditable.
- Framework-free domain modules preserve future macOS support and allow a UI or
  runtime replacement if measurements require it.

### Costs and risks

- Electron memory overhead threatens the approximately 400 MB target and must be
  profiled with all three windows open.
- Transparent windows, display scaling, and multi-monitor dragging have
  platform-specific edge cases.
- Multiple renderer technologies require explicit contracts and consistent
  accessibility behavior.
- Native SQLite modules complicate Electron ABI compatibility and packaging.
- The Electron Forge Vite plugin is currently documented as experimental, so
  packaging/build integration must be proven rather than assumed.

### Required mitigations

- Lazy-create secondary windows; suspend or destroy unused renderers.
- Stop PixiJS requestAnimationFrame when no animation or work requires it.
- Keep simulation time independent of render frames and use saved seeded
  randomness.
- Validate IPC sender, operation, payload, authorization, and state version.
- Test multiple monitors, multiple scale factors, sleep/wake, lock/unlock,
  renderer failure, clean exit, crash recovery, and native-module packaging
  before expanding scope.

## Alternatives considered

### Tauri

Potentially lower memory use, but introduces Rust and raises solo-development
cost for the first prototype. Retain as a measured fallback only if Electron
cannot meet resource targets after mitigation.

### Native Windows UI

Could provide excellent platform integration but conflicts with cross-platform
direction and the chosen TypeScript/React skill base.

### All-React/DOM rendering

Good for management UI but less suitable for sprite sheets, animation fallback,
room scenes, and furniture rendering.

### A full game engine

Provides scene tooling but adds runtime and integration complexity for a desktop
utility whose privileged lifecycle, IPC, and conventional UI remain central.

## Validation

This decision remains accepted only if the first vertical slice demonstrates:

- stable transparent-window and multi-monitor behavior on Windows 11;
- deterministic simulation independent of renderer timing;
- secure typed renderer boundaries and snapshot resynchronization;
- reliable SQLite persistence and recovery;
- safe pet transfer between desktop and pocket home; and
- near-zero static idle CPU with normal memory approximately at or below 400 MB.

Failure of these gates triggers a new ADR before stack replacement or material
scope expansion.
