# Desktop Pet

Windows-first Electron desktop-pet project using TypeScript, React, and PixiJS.

The product baseline is `docs/Desktop_Pet_SRS_v1.0.docx`. The initial technical
design is `docs/Desktop_Pet_SDD_v1.0.docx` and takes precedence for technical
implementation decisions.

## Current scope

This repository contains only the foundation for the first prototype vertical
slice described by SDD section 22. Gmail, advanced careers, general mod support,
macOS packaging, multiple pets, and other post-slice features are intentionally
not implemented.

## Project structure

- `src/main`: Electron main process and platform services.
- `src/preload`: narrow typed renderer bridge.
- `src/renderers`: PixiJS pet/Home and React management, commerce, and settings entry points.
- `src/persistence`: SQLite repositories, recovery policy, and diagnostics.
- `content/core`: built-in prototype assets and data.
- `docs/architecture`: durable summaries of architectural constraints.
- `docs/implementation`: scoped implementation plans.
- `docs/adr`: architecture decision records.

Domain, simulation, persistence, and renderer-contract code will be added as
ordinary folders under `src/` when the vertical slice reaches those milestones.
They should become separate packages only if the project later has an
independent application, publishing boundary, or demonstrable build need.

## Minimal window artifact

The runnable prototype is a secure, transparent Windows pet window with:

- four-frame PixiJS idle animation and deterministic animation fallbacks;
- click-to-pet and hold-to-drag interaction;
- bounded cross-display positioning with a minimum visible grab area;
- authoritative main-process hunger, thirst, mood, and energy simulation;
- versioned renderer patches with full-snapshot resynchronization;
- a right-click Status, Interact, and Activity overlay with subsystem shortcuts;
- a separate pinned work countdown with immediate Cancel; and
- lazy, single-instance Management, Commerce, and Settings windows.

Right-click the pet to toggle its stats overlay. Click outside the overlay to
Outward shortcuts open Home, Work, Careers, Shop, and Settings. Work, Careers,
and Memories share Management; Shop and Inventory share Commerce; Settings has
its own window. These windows can coexist and reuse their existing instances. During
work, the countdown and Cancel control remain visible independently, so the
stats overlay can be opened and dismissed without disturbing the active job.

Pet state and desktop position persist locally in SQLite. Active work is
checkpointed every five seconds, cancelled proportionally on close or crash,
and restored without duplicating rewards. Closed-app need decay runs at half
the online rate for at most eight hours. Database failures stop safely and are
recorded in rotating local JSONL diagnostics; profiles are never silently
reset.

```bash
npm install
npm start
```
