export type FurnitureKind = "bed" | "desk";

export interface FurniturePlacement {
  height: number;
  id: string;
  kind: FurnitureKind;
  width: number;
  x: number;
  y: number;
}

export interface HomeLayout {
  furniture: readonly FurniturePlacement[];
  layoutVersion: number;
  roomId: string;
}

export interface HomeLayoutSnapshot {
  layout: HomeLayout;
}

export interface SaveHomeLayoutCommand {
  baseVersion: number;
  furniture: readonly FurniturePlacement[];
  type: "saveHomeLayout";
}

export type HomePlacementIssue =
  | "collision"
  | "duplicate"
  | "footprint"
  | "missing"
  | "outOfBounds"
  | "unknownFurniture";

export interface HomePlacementValidation {
  issue?: HomePlacementIssue;
  valid: boolean;
}
