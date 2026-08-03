import type {
  MemoryCursor,
  MemoryPage,
} from "../shared/memory-types.js";

export interface MemoryRepository {
  loadMemoryPage(before: MemoryCursor | undefined, limit: number): MemoryPage;
}
