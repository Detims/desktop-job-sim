import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { CARE_ITEMS } from "../../domain/care-items.js";
import { personalLevel } from "../../domain/personal-growth.js";
import type {
  CommerceTab,
  PetCommand,
  PetState,
} from "../../shared/pet-types.js";
import { applyPatch, readSnapshot } from "../shared/pet-store.js";
import {
  itemDescription,
  purchaseBlockedReason,
  useBlockedReason,
} from "./commerce-model.js";
import "./styles.css";

function App() {
  const [activeTab, setActiveTab] = useState<CommerceTab>("shop");
  const [state, setState] = useState<PetState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const resync = useCallback(async () => {
    try {
      setState(readSnapshot(await window.desktopCommerce.getSnapshot()));
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to load pet state.");
    }
  }, []);

  useEffect(() => {
    void resync();
    const removePatch = window.desktopCommerce.onPatch((patch) => {
      setState((current) => {
        if (current === null) return current;
        const next = applyPatch(current, patch);
        if (next === null) void resync();
        return next ?? current;
      });
    });
    const removeTab = window.desktopCommerce.onTabRequested(setActiveTab);
    return () => {
      removePatch();
      removeTab();
    };
  }, [resync]);

  const dispatch = useCallback(async (command: PetCommand, itemId: string) => {
    setBusyItem(itemId);
    setError(null);
    try {
      setState(readSnapshot(await window.desktopCommerce.dispatch(command)));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Item action failed.");
      await resync();
    } finally {
      setBusyItem(null);
    }
  }, [resync]);

  if (state === null) {
    return <main className="loading">{error ?? "Loading shop…"}</main>;
  }

  const level = personalLevel(state.generalXp);
  return (
    <main className="commerce-shell">
      <header className="app-header">
        <div><p className="eyebrow">Desktop Pet</p><h1>Shop &amp; Inventory</h1></div>
        <div className="account-summary">
          <span>Level {level}</span>
          <strong>{state.household.wallet.toFixed(1)} coins</strong>
        </div>
      </header>
      <nav className="tabs" aria-label="Commerce sections">
        {(["shop", "inventory"] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "selected" : ""}
            id={`${tab}-tab`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {tab === "shop" ? "Shop" : "Inventory"}
          </button>
        ))}
      </nav>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}
      <section className="item-grid" aria-labelledby={`${activeTab}-tab`}>
        {CARE_ITEMS.map((item) => {
          const quantity = state.household.inventory[item.id] ?? 0;
          const purchaseBlock = purchaseBlockedReason(state, item);
          const blockedReason = useBlockedReason(state, item);
          const isBusy = busyItem === item.id;
          return (
            <article className="item-card" key={item.id}>
              <div className="item-copy">
                <p className="eyebrow">{item.action === "gift" ? "Gift" : "Care item"}</p>
                <h2>{item.name}</h2>
                <p>{itemDescription(item)}</p>
                {activeTab === "shop" ? (
                  <small>
                    {item.price} coins
                    {item.requiredLevel > 1 ? ` · Level ${item.requiredLevel}` : ""}
                    {item.requiredBond > 0 ? ` · Bond ${item.requiredBond}` : ""}
                  </small>
                ) : <small>{quantity} owned</small>}
              </div>
              {activeTab === "shop" ? (
                <button
                  disabled={isBusy || purchaseBlock !== null}
                  onClick={() => void dispatch({ itemId: item.id, type: "purchaseItem" }, item.id)}
                  title={purchaseBlock ?? ""}
                  type="button"
                >
                  {purchaseBlock?.startsWith("Requires ") ? purchaseBlock.replace("Requires ", "") : isBusy ? "Buying…" : "Buy"}
                </button>
              ) : (
                <button
                  disabled={isBusy || blockedReason !== null}
                  onClick={() => void dispatch({ itemId: item.id, type: "useItem" }, item.id)}
                  title={blockedReason ?? ""}
                  type="button"
                >
                  {isBusy ? "Using…" : item.action === "gift" ? "Give" : "Use"}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

const root = document.querySelector("#root");
if (root === null) throw new Error("Commerce root was not found.");
createRoot(root).render(<App />);
