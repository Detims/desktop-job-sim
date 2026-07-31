import type {
  FurnitureKind,
  FurniturePlacement,
  HomeLayout,
  HomePlacementValidation,
} from "../shared/home-types.js";

export const HOME_ROOM_ID = "core:starter-room";
export const HOME_GRID_COLUMNS = 12;
export const HOME_GRID_ROWS = 8;

interface FurnitureDefinition {
  height: number;
  id: string;
  kind: FurnitureKind;
  width: number;
}

export const HOME_FURNITURE_DEFINITIONS: Readonly<
  Record<string, FurnitureDefinition>
> = Object.freeze({
  "core:starter-bed": Object.freeze({
    height: 2,
    id: "core:starter-bed",
    kind: "bed",
    width: 3,
  }),
  "core:starter-desk": Object.freeze({
    height: 2,
    id: "core:starter-desk",
    kind: "desk",
    width: 2,
  }),
});

export function createInitialHomeLayout(): HomeLayout {
  return {
    furniture: [
      {
        ...HOME_FURNITURE_DEFINITIONS["core:starter-bed"]!,
        x: 1,
        y: 1,
      },
      {
        ...HOME_FURNITURE_DEFINITIONS["core:starter-desk"]!,
        x: 8,
        y: 1,
      },
    ],
    layoutVersion: 0,
    roomId: HOME_ROOM_ID,
  };
}

function overlaps(
  left: FurniturePlacement,
  right: FurniturePlacement,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function validateHomeFurniture(
  furniture: readonly FurniturePlacement[],
): HomePlacementValidation {
  const ids = new Set<string>();

  for (const placement of furniture) {
    if (ids.has(placement.id)) {
      return { issue: "duplicate", valid: false };
    }
    ids.add(placement.id);

    const definition = HOME_FURNITURE_DEFINITIONS[placement.id];
    if (definition === undefined || definition.kind !== placement.kind) {
      return { issue: "unknownFurniture", valid: false };
    }
    if (
      definition.width !== placement.width ||
      definition.height !== placement.height
    ) {
      return { issue: "footprint", valid: false };
    }
    if (
      placement.x < 0 ||
      placement.y < 0 ||
      placement.x + placement.width > HOME_GRID_COLUMNS ||
      placement.y + placement.height > HOME_GRID_ROWS
    ) {
      return { issue: "outOfBounds", valid: false };
    }
  }

  if (ids.size !== Object.keys(HOME_FURNITURE_DEFINITIONS).length) {
    return { issue: "missing", valid: false };
  }

  for (let leftIndex = 0; leftIndex < furniture.length; leftIndex += 1) {
    const left = furniture[leftIndex];
    if (left === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < furniture.length;
      rightIndex += 1
    ) {
      const right = furniture[rightIndex];
      if (right !== undefined && overlaps(left, right)) {
        return { issue: "collision", valid: false };
      }
    }
  }

  return { valid: true };
}

export function assertValidHomeLayout(layout: HomeLayout): HomeLayout {
  if (layout.roomId !== HOME_ROOM_ID) {
    throw new Error(`Unknown home room: ${layout.roomId}`);
  }
  const validation = validateHomeFurniture(layout.furniture);
  if (!validation.valid) {
    throw new Error(`Invalid home furniture: ${validation.issue}`);
  }
  return layout;
}
