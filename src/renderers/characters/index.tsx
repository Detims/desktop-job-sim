import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  CharacterLibrarySnapshot,
  CharacterPackPreview,
} from "../../shared/character-types.js";
import "./styles.css";

type Tab = "library" | "import";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The character operation failed.";
}

function App() {
  const [tab, setTab] = useState<Tab>("library");
  const [library, setLibrary] = useState<CharacterLibrarySnapshot | null>(null);
  const [preview, setPreview] = useState<CharacterPackPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLibrary(await window.desktopCharacters.getLibrary());
      setError(null);
    } catch (reason: unknown) {
      setError(message(reason));
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.desktopCharacters.onLibraryChanged(setLibrary);
  }, [reload]);

  const selectImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const selected = await window.desktopCharacters.selectImport();
      if (selected !== null) setPreview(selected);
    } catch (reason: unknown) {
      setPreview(null);
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (preview === null) return;
    setBusy(true);
    setError(null);
    try {
      setLibrary(await window.desktopCharacters.command({
        previewToken: preview.token,
        type: "install",
      }));
      setPreview(null);
      setTab("library");
    } catch (reason: unknown) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }, [preview]);

  const apply = useCallback(async (packId: string) => {
    setBusy(true);
    setError(null);
    try {
      setLibrary(await window.desktopCharacters.command({ packId, type: "apply" }));
    } catch (reason: unknown) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async (packId: string, name: string) => {
    if (!window.confirm(`Remove ${name}? This deletes its installed local files.`)) return;
    setBusy(true);
    setError(null);
    try {
      setLibrary(await window.desktopCharacters.command({ packId, type: "remove" }));
    } catch (reason: unknown) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="characters-shell">
      <header>
        <div><p className="eyebrow">Desktop Pet</p><h1>Characters</h1></div>
        <nav aria-label="Character sections">
          <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")} type="button">Library</button>
          <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")} type="button">Import</button>
        </nav>
      </header>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}
      {library !== null && !library.activeAvailable && (
        <div className="warning-banner" role="status">
          The selected pack is unavailable. The built-in character is being used until it is reinstalled or another character is applied.
        </div>
      )}

      {tab === "library" ? (
        <section className="library" aria-label="Installed characters">
          {library === null ? <p>Loading characters...</p> : library.packs.map((pack) => {
            const active = pack.id === library.activePackId && library.activeAvailable;
            return (
              <article className="character-card" key={pack.id}>
                <div>
                  <div className="card-title"><h2>{pack.name}</h2>{active && <span>Active</span>}</div>
                  <p>{pack.creator} · v{pack.version}</p>
                  <small>{pack.license}</small>
                </div>
                <div className="card-actions">
                  <button disabled={busy || active} onClick={() => void apply(pack.id)} type="button">Apply</button>
                  {!pack.builtIn && (
                    <button className="danger" disabled={busy || pack.id === library.activePackId} onClick={() => void remove(pack.id, pack.name)} type="button">Remove</button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="import-panel">
          <div className="import-intro">
            <div><h2>Import a ZIP character pack</h2><p>Packages are validated before any files are installed.</p></div>
            <button disabled={busy} onClick={() => void selectImport()} type="button">Choose ZIP</button>
          </div>
          {preview === null ? (
            <div className="empty-preview">No validated pack selected.</div>
          ) : (
            <article className="preview-card">
              <div className="preview-image"><img alt={`${preview.manifest.metadata.name} preview`} src={preview.previewDataUrl} /></div>
              <div>
                <p className="eyebrow">Validated preview</p>
                <h2>{preview.manifest.metadata.name}</h2>
                <p>{preview.manifest.metadata.creator} · v{preview.manifest.version}</p>
                <dl>
                  <div><dt>License</dt><dd>{preview.manifest.metadata.license}</dd></div>
                  <div><dt>Source</dt><dd>{preview.manifest.metadata.source}</dd></div>
                  <div><dt>Commercial use</dt><dd>{preview.manifest.metadata.commercialUse}</dd></div>
                </dl>
                {preview.warnings.length > 0 && (
                  <ul className="warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                )}
                <button className="primary" disabled={busy} onClick={() => void install()} type="button">Install</button>
              </div>
            </article>
          )}
        </section>
      )}
    </main>
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (root === null) throw new Error("Characters root is missing.");
createRoot(root).render(<App />);
