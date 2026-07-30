# ADR-002: Single-package npm project

- Status: Accepted
- Date: 2026-07-30
- Scope: Repository layout and package management
- Amends: ADR-001 package-layout decision

## Context

The initial scaffold created one Electron application and four empty internal
workspace packages. The project currently has one developer, one deployable
application, one release lifecycle, and no independently published libraries.
The separate packages added manifests, TypeScript configurations, lockfile
tooling, and filtered commands without providing runtime isolation.

The developer's normal terminal is Bash, where the scaffold's pnpm workflow is
not available. npm is already available and uses conventional cross-shell
commands for this project.

## Decision

Use one npm package at the repository root.

- Keep one `package.json`, one `package-lock.json`, and one `tsconfig.json`.
- Keep Electron main, preload, and renderer boundaries as folders under `src/`.
- Add domain, simulation, persistence, and renderer-contract modules as ordinary
  `src/` folders only when their vertical-slice milestones begin.
- Preserve dependency direction through imports, tests, and later lint rules
  rather than through workspace package manifests.
- Use npm scripts that run in Bash, PowerShell, and standard CI shells.

## Consequences

### Positive

- Fewer manifests, lockfiles, configuration files, and package-manager concepts.
- A conventional `npm install`, `npm start`, `npm test`, and `npm run build`
  workflow.
- Faster iteration for a solo project without weakening Electron process
  isolation or main-process state authority.
- Internal modules can be moved without package export and workspace-link churn.

### Costs

- TypeScript package boundaries no longer enforce dependency direction.
- A future second application or independently published library may justify
  extracting one or more folders into packages.

## Extraction trigger

Do not recreate a monorepo speculatively. Extract a package only when at least
one of these is true:

- a second application consumes the module;
- the module is independently published or versioned;
- it requires an independent build or test lifecycle; or
- measured build performance requires a separate cache boundary.

## Validation

The migration is complete when:

- npm installs from the root lockfile;
- typecheck, tests, and all three Vite builds pass from root scripts;
- the Electron smoke test still creates the transparent pet window; and
- no source import relies on a workspace package.
