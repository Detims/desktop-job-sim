import { Application, Container, Graphics } from "pixi.js";

import type { PetState } from "../../shared/pet-types.js";

export function isClerkWork(state: PetState): boolean {
  return state.activity?.type === "careerJob" &&
    state.activity.careerId === "core:clerk";
}

export class ClerkWorkVisual {
  private readonly container = new Container();
  private reducedMotion = false;

  constructor(pixi: Application, x: number, y: number, scale = 1) {
    const paper = new Graphics()
      .roundRect(-28, -19, 56, 38, 4)
      .fill({ color: 0xfffbeb, alpha: 0.98 })
      .stroke({ color: 0x8b6f47, width: 2 })
      .moveTo(-18, -9).lineTo(17, -9).stroke({ color: 0x94a3b8, width: 2 })
      .moveTo(-18, 0).lineTo(12, 0).stroke({ color: 0x94a3b8, width: 2 })
      .moveTo(-18, 9).lineTo(18, 9).stroke({ color: 0x94a3b8, width: 2 });
    const pen = new Graphics()
      .roundRect(-3, -25, 6, 50, 3)
      .fill({ color: 0x2563eb })
      .stroke({ color: 0x172554, width: 1 });
    pen.rotation = 0.65;
    pen.position.set(22, -4);
    this.container.addChild(paper, pen);
    this.container.position.set(x, y);
    this.container.scale.set(scale);
    this.container.visible = false;
    pixi.stage.addChild(this.container);
    pixi.ticker.add(() => {
      if (!this.container.visible || this.reducedMotion) return;
      const phase = performance.now() / 220;
      this.container.rotation = Math.sin(phase) * 0.045;
      this.container.y = y + Math.sin(phase * 1.3) * 3;
    });
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) this.container.rotation = 0;
  }

  setState(state: PetState): void {
    this.container.visible = isClerkWork(state);
  }
}
