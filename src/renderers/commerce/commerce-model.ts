import { personalLevel } from "../../domain/personal-growth.js";
import { DAILY_BOND_CAP, localDateKey } from "../../domain/relationship.js";
import type { CareItemDefinition, PetState } from "../../shared/pet-types.js";

export function itemDescription(item: CareItemDefinition): string {
  if (item.action === "feed") return `Restores ${item.restoreAmount} Hunger`;
  if (item.action === "drink") return `Restores ${item.restoreAmount} Thirst`;
  if (item.action === "clean") return "Restores Hygiene to Clean";
  if (item.action === "medicine") return "Halves Serious Illness recovery time";
  return `+${item.relationshipAffection} Affection · +${item.relationshipBond} Bond`;
}

export function purchaseBlockedReason(
  state: PetState,
  item: CareItemDefinition,
): string | null {
  if (personalLevel(state.generalXp) < item.requiredLevel) {
    return `Requires Level ${item.requiredLevel}`;
  }
  if (state.relationship.bond < item.requiredBond) {
    return `Requires Bond ${item.requiredBond}`;
  }
  if (state.household.wallet < item.price) return "Not enough coins";
  return null;
}

export function useBlockedReason(
  state: PetState,
  item: CareItemDefinition,
  now = Date.now(),
): string | null {
  if ((state.household.inventory[item.id] ?? 0) < 1) return "Not in inventory";
  if (item.action === "feed" && state.needs.hunger >= 100) return "Hunger is already full";
  if (item.action === "drink" && state.needs.thirst >= 100) return "Thirst is already full";
  if (item.action === "clean" && state.care.hygiene >= 100) return "Hygiene is already Clean";
  if (item.action === "medicine") {
    if (state.care.seriousIllness === null) return "Only usable during Serious Illness";
    if (state.care.seriousIllness.medicineUsed) return "Medicine already used for this illness";
  }
  if (item.action === "gift") {
    const today = localDateKey(now);
    const bondUsed =
      state.relationship.bondAwardDate === "" || today > state.relationship.bondAwardDate
        ? 0
        : state.relationship.bondAwardedToday;
    if (
      state.relationship.affection >= 100 &&
      (state.relationship.bond >= 100 || bondUsed >= DAILY_BOND_CAP)
    ) return "No relationship benefit available right now";
  }
  return null;
}
