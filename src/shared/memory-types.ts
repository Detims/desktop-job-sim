export type MemoryCategory = "career" | "illness" | "qualification";

export interface MemoryEntry {
  category: MemoryCategory;
  description: string;
  memoryId: string;
  occurredAt: number;
  petId: string;
  title: string;
}

export interface MemoryEntryDraft {
  category: MemoryCategory;
  description: string;
  petId: string;
  title: string;
}

export interface MemoryCursor {
  memoryId: string;
  occurredAt: number;
}

export interface MemoryPageRequest {
  before?: MemoryCursor;
  limit?: number;
}

export interface MemoryPage {
  memories: MemoryEntry[];
  nextCursor: MemoryCursor | null;
}
