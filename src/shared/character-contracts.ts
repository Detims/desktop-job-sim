import { z } from "zod";

import { CHARACTER_ANIMATION_STATES } from "./character-types.js";

const PACK_ID = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const ASSET_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[\x20-\x7e]+$/;

const PointSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
});

export const CharacterAnimationDefinitionSchema = z.object({
  fps: z.number().positive().max(24),
  frames: z.array(z.number().int().nonnegative()).min(1).max(256),
  loop: z.boolean(),
});

export const CharacterPackManifestSchema = z.object({
  animations: z.record(
    z.string().regex(/^[a-z][a-z0-9_-]*$/),
    CharacterAnimationDefinitionSchema,
  ).refine((animations) => animations.idle !== undefined, {
    message: "The idle animation is required.",
  }),
  canvas: z.object({
    anchors: z.object({ feet: PointSchema }),
    height: z.number().int().positive().max(4096),
    hitbox: z.object({
      height: z.number().positive(),
      width: z.number().positive(),
      x: z.number().finite().nonnegative(),
      y: z.number().finite().nonnegative(),
    }),
    pivot: PointSchema,
    width: z.number().int().positive().max(4096),
  }),
  engineVersion: z.literal(1),
  fallbacks: z.record(
    z.enum(CHARACTER_ANIMATION_STATES),
    z.string().regex(/^[a-z][a-z0-9_-]*$/),
  ),
  id: z.string().regex(PACK_ID),
  metadata: z.object({
    commercialUse: z.enum(["allowed", "disallowed", "unknown"]),
    creator: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    license: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    source: z.string().trim().min(1).max(500),
    thirdPartyAssets: z.array(z.object({
      license: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(120),
      owner: z.string().trim().min(1).max(120),
      source: z.string().trim().min(1).max(500),
    })).max(100),
  }),
  schemaVersion: z.literal(1),
  spritesheet: z.object({
    frameCount: z.number().int().positive().max(256),
    frameHeight: z.number().int().positive().max(4096),
    frameWidth: z.number().int().positive().max(4096),
    path: z.string().regex(ASSET_PATH).refine(
      (path) => path.toLowerCase().endsWith(".png"),
      { message: "The spritesheet must be a PNG file." },
    ),
    scaleMode: z.enum(["linear", "nearest"]),
  }),
  version: z.string().regex(VERSION),
}).superRefine((manifest, context) => {
  for (const [name, animation] of Object.entries(manifest.animations)) {
    for (const frame of animation.frames) {
      if (frame >= manifest.spritesheet.frameCount) {
        context.addIssue({
          code: "custom",
          message: `Animation ${name} references frame ${frame}, outside the spritesheet.`,
          path: ["animations", name, "frames"],
        });
      }
    }
  }
  for (const state of CHARACTER_ANIMATION_STATES) {
    const target = manifest.fallbacks[state];
    if (target !== undefined && manifest.animations[target] === undefined) {
      context.addIssue({
        code: "custom",
        message: `Fallback ${state} references missing animation ${target}.`,
        path: ["fallbacks", state],
      });
    }
  }
  if (manifest.fallbacks.idle !== "idle") {
    context.addIssue({
      code: "custom",
      message: "The idle state must resolve to the idle animation.",
      path: ["fallbacks", "idle"],
    });
  }
  const { canvas } = manifest;
  if (
    canvas.pivot.x > canvas.width || canvas.pivot.y > canvas.height ||
    canvas.anchors.feet.x > canvas.width || canvas.anchors.feet.y > canvas.height ||
    canvas.hitbox.x + canvas.hitbox.width > canvas.width ||
    canvas.hitbox.y + canvas.hitbox.height > canvas.height
  ) {
    context.addIssue({
      code: "custom",
      message: "Canvas anchors, pivot, and hitbox must remain within the logical canvas.",
      path: ["canvas"],
    });
  }
});

export const CharacterCommandSchema = z.discriminatedUnion("type", [
  z.object({ packId: z.string().regex(PACK_ID), type: z.literal("apply") }),
  z.object({ previewToken: z.string().uuid(), type: z.literal("install") }),
  z.object({ packId: z.string().regex(PACK_ID), type: z.literal("remove") }),
]);

export const CharacterPackIdSchema = z.string().regex(PACK_ID);
