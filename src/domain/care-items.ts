import basicMeal from "../../content/core/items/basic-meal.json" with { type: "json" };
import medicine from "../../content/core/items/medicine.json" with { type: "json" };
import soap from "../../content/core/items/soap.json" with { type: "json" };
import water from "../../content/core/items/water.json" with { type: "json" };
import smallGift from "../../content/core/items/small-gift.json" with { type: "json" };
import favoriteTreat from "../../content/core/items/favorite-treat.json" with { type: "json" };
import { CareItemDefinitionSchema, type CareItemDefinition } from "../shared/contracts.js";

export const CARE_ITEMS: readonly CareItemDefinition[] = Object.freeze(
  [water, basicMeal, soap, medicine, smallGift, favoriteTreat].map((item) =>
    CareItemDefinitionSchema.parse(item),
  ),
);

const ITEMS_BY_ID = new Map(CARE_ITEMS.map((item) => [item.id, item]));

export function getCareItem(itemId: string): CareItemDefinition {
  const item = ITEMS_BY_ID.get(itemId);
  if (item === undefined) throw new Error("That care item is unavailable.");
  return item;
}
