import { assertValidHomeLayout } from "../domain/home-layout.js";
import type { HomeLayoutRepository } from "../persistence/home-layout-repository.js";
import { PersistenceError } from "../persistence/persistence-error.js";
import { materializeEvent } from "../shared/meaningful-event.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";
import type {
  HomeLayout,
  HomeLayoutSnapshot,
  SaveHomeLayoutCommand,
} from "../shared/home-types.js";

export class HomeLayoutController {
  private layout: HomeLayout;

  constructor(
    initialLayout: HomeLayout,
    private readonly repository: HomeLayoutRepository,
    private readonly onActivity?: (event: MeaningfulEvent) => void,
  ) {
    this.layout = structuredClone(assertValidHomeLayout(initialLayout));
  }

  getSnapshot(): HomeLayoutSnapshot {
    return { layout: structuredClone(this.layout) };
  }

  save(command: SaveHomeLayoutCommand, now = Date.now()): HomeLayoutSnapshot {
    if (command.baseVersion !== this.layout.layoutVersion) {
      throw new PersistenceError(
        "home.layout_conflict",
        "The home layout changed before this save could be applied.",
      );
    }

    const nextLayout = assertValidHomeLayout({
      furniture: structuredClone(command.furniture),
      layoutVersion: this.layout.layoutVersion + 1,
      roomId: this.layout.roomId,
    });

    const event = materializeEvent(
      {
        details: { layoutVersion: nextLayout.layoutVersion },
        summary: "Home layout saved.",
        type: "home.layout_saved",
      },
      now,
    );
    this.repository.saveHomeLayout(nextLayout, this.layout.layoutVersion, event);
    this.layout = structuredClone(nextLayout);
    this.onActivity?.(structuredClone(event));
    return this.getSnapshot();
  }
}
