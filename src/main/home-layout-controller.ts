import { assertValidHomeLayout } from "../domain/home-layout.js";
import type { HomeLayoutRepository } from "../persistence/home-layout-repository.js";
import { PersistenceError } from "../persistence/persistence-error.js";
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
  ) {
    this.layout = structuredClone(assertValidHomeLayout(initialLayout));
  }

  getSnapshot(): HomeLayoutSnapshot {
    return { layout: structuredClone(this.layout) };
  }

  save(command: SaveHomeLayoutCommand): HomeLayoutSnapshot {
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

    this.repository.saveHomeLayout(nextLayout, this.layout.layoutVersion);
    this.layout = structuredClone(nextLayout);
    return this.getSnapshot();
  }
}
