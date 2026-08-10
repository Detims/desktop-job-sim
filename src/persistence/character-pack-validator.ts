import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import * as yauzl from "yauzl";

import { CharacterPackManifestSchema } from "../shared/character-contracts.js";
import type { CharacterPackManifest } from "../shared/character-types.js";

export const CHARACTER_PACK_LIMITS = Object.freeze({
  compressedBytes: 50 * 1024 * 1024,
  entries: 256,
  expandedBytes: 200 * 1024 * 1024,
  fileBytes: 25 * 1024 * 1024,
  imageDimension: 4096,
});

export interface ArchiveEntryMetadata {
  compressedSize: number;
  encrypted: boolean;
  fileName: string;
  isDirectory: boolean;
  isSymlink: boolean;
  uncompressedSize: number;
}

export interface ValidatedCharacterPack {
  archiveSha256: string;
  manifest: CharacterPackManifest;
  previewDataUrl: string;
  spritesheet: Buffer;
  warnings: string[];
}

export class CharacterPackValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CharacterPackValidationError";
  }
}

function safeArchivePath(fileName: string, isDirectory: boolean): boolean {
  const candidate = isDirectory ? fileName.slice(0, -1) : fileName;
  if (
    candidate.length === 0 || candidate.length > 240 ||
    candidate.startsWith("/") || candidate.includes("\\") ||
    candidate.includes("\0") || candidate.includes(":") ||
    !/^[A-Za-z0-9._/-]+$/.test(candidate)
  ) {
    return false;
  }
  const segments = candidate.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export function assertArchiveEntriesWithinLimits(
  entries: readonly ArchiveEntryMetadata[],
): void {
  if (entries.length > CHARACTER_PACK_LIMITS.entries) {
    throw new CharacterPackValidationError(
      "character.archive_too_many_entries",
      `Character packs may contain at most ${CHARACTER_PACK_LIMITS.entries} archive entries.`,
    );
  }
  let expandedBytes = 0;
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!safeArchivePath(entry.fileName, entry.isDirectory)) {
      throw new CharacterPackValidationError(
        "character.archive_unsafe_path",
        `Archive entry ${JSON.stringify(entry.fileName)} uses an unsafe path.`,
      );
    }
    const normalized = entry.fileName.toLowerCase();
    if (paths.has(normalized)) {
      throw new CharacterPackValidationError(
        "character.archive_duplicate_path",
        `Archive entry ${JSON.stringify(entry.fileName)} conflicts with another path.`,
      );
    }
    paths.add(normalized);
    if (entry.encrypted) {
      throw new CharacterPackValidationError(
        "character.archive_encrypted",
        "Encrypted character packs are not supported.",
      );
    }
    if (entry.isSymlink) {
      throw new CharacterPackValidationError(
        "character.archive_symlink",
        "Character packs may not contain symbolic links.",
      );
    }
    if (!entry.isDirectory) {
      const extension = entry.fileName.slice(entry.fileName.lastIndexOf(".")).toLowerCase();
      if (extension !== ".json" && extension !== ".png") {
        throw new CharacterPackValidationError(
          "character.archive_unsupported_file",
          `Unsupported character-pack file: ${entry.fileName}.`,
        );
      }
      if (entry.uncompressedSize > CHARACTER_PACK_LIMITS.fileBytes) {
        throw new CharacterPackValidationError(
          "character.archive_file_too_large",
          `Archive entry ${JSON.stringify(entry.fileName)} exceeds the per-file limit.`,
        );
      }
      expandedBytes += entry.uncompressedSize;
    }
  }
  if (expandedBytes > CHARACTER_PACK_LIMITS.expandedBytes) {
    throw new CharacterPackValidationError(
      "character.archive_expanded_too_large",
      "The expanded character pack exceeds the 200 MB limit.",
    );
  }
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      {
        autoClose: false,
        decodeStrings: true,
        lazyEntries: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, zipFile) => {
        if (error !== null) reject(error);
        else if (zipFile === undefined) reject(new Error("ZIP file was not opened."));
        else resolve(zipFile);
      },
    );
  });
}

function entryMetadata(entry: yauzl.Entry): ArchiveEntryMetadata {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return {
    compressedSize: entry.compressedSize,
    encrypted: (entry.generalPurposeBitFlag & 1) !== 0,
    fileName: entry.fileName,
    isDirectory: entry.fileName.endsWith("/"),
    isSymlink: (unixMode & 0o170000) === 0o120000,
    uncompressedSize: entry.uncompressedSize,
  };
}

function listEntries(zipFile: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    const fail = (error: Error) => reject(error);
    zipFile.on("error", fail);
    zipFile.on("entry", (entry: yauzl.Entry) => {
      entries.push(entry);
      if (entries.length > CHARACTER_PACK_LIMITS.entries) {
        reject(new CharacterPackValidationError(
          "character.archive_too_many_entries",
          `Character packs may contain at most ${CHARACTER_PACK_LIMITS.entries} archive entries.`,
        ));
        return;
      }
      zipFile.readEntry();
    });
    zipFile.on("end", () => {
      zipFile.removeListener("error", fail);
      resolve(entries);
    });
    zipFile.readEntry();
  });
}

function readEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error !== null) {
        reject(error);
        return;
      }
      if (stream === undefined) {
        reject(new Error("ZIP entry stream was not opened."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > CHARACTER_PACK_LIMITS.fileBytes) {
          stream.destroy(new CharacterPackValidationError(
            "character.archive_file_too_large",
            `Archive entry ${JSON.stringify(entry.fileName)} exceeds the per-file limit.`,
          ));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

export function pngDimensions(buffer: Buffer): { height: number; width: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, signature.length).equals(signature) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new CharacterPackValidationError(
      "character.image_invalid",
      "The referenced spritesheet is not a valid PNG image.",
    );
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (
    width === 0 || height === 0 ||
    width > CHARACTER_PACK_LIMITS.imageDimension ||
    height > CHARACTER_PACK_LIMITS.imageDimension
  ) {
    throw new CharacterPackValidationError(
      "character.image_dimensions_invalid",
      "The spritesheet dimensions are zero or exceed 4096 by 4096 pixels.",
    );
  }
  return { height, width };
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function validateCharacterPack(
  path: string,
): Promise<ValidatedCharacterPack> {
  const archive = await fs.stat(path);
  if (!archive.isFile() || archive.size > CHARACTER_PACK_LIMITS.compressedBytes) {
    throw new CharacterPackValidationError(
      "character.archive_too_large",
      "The selected ZIP must be a file no larger than 50 MB.",
    );
  }

  let zipFile: yauzl.ZipFile | undefined;
  try {
    zipFile = await openZip(path);
    const entries = await listEntries(zipFile);
    const metadata = entries.map(entryMetadata);
    assertArchiveEntriesWithinLimits(metadata);
    for (const entry of entries) {
      if (!entry.fileName.endsWith("/") && entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
        throw new CharacterPackValidationError(
          "character.archive_compression_unsupported",
          `Archive entry ${JSON.stringify(entry.fileName)} uses unsupported compression.`,
        );
      }
    }

    const manifestEntries = entries.filter(
      (entry) => entry.fileName.toLowerCase() === "character-pack.json",
    );
    if (manifestEntries.length !== 1) {
      throw new CharacterPackValidationError(
        "character.manifest_missing",
        "The ZIP must contain exactly one character-pack.json at its root.",
      );
    }
    const manifestBuffer = await readEntry(zipFile, manifestEntries[0]!);
    let manifestInput: unknown;
    try {
      manifestInput = JSON.parse(manifestBuffer.toString("utf8"));
    } catch {
      throw new CharacterPackValidationError(
        "character.manifest_json_invalid",
        "character-pack.json is not valid JSON.",
      );
    }
    const parsed = CharacterPackManifestSchema.safeParse(manifestInput);
    if (!parsed.success) {
      throw new CharacterPackValidationError(
        "character.manifest_invalid",
        parsed.error.issues.map((issue) => issue.message).join(" "),
      );
    }
    const manifest = parsed.data as CharacterPackManifest;
    const sheetEntry = entries.find(
      (entry) => entry.fileName === manifest.spritesheet.path,
    );
    if (sheetEntry === undefined || sheetEntry.fileName.endsWith("/")) {
      throw new CharacterPackValidationError(
        "character.spritesheet_missing",
        `The spritesheet ${manifest.spritesheet.path} is missing from the ZIP.`,
      );
    }
    const spritesheet = await readEntry(zipFile, sheetEntry);
    const dimensions = pngDimensions(spritesheet);
    if (
      dimensions.width % manifest.spritesheet.frameWidth !== 0 ||
      dimensions.height % manifest.spritesheet.frameHeight !== 0 ||
      (dimensions.width / manifest.spritesheet.frameWidth) *
        (dimensions.height / manifest.spritesheet.frameHeight) <
        manifest.spritesheet.frameCount
    ) {
      throw new CharacterPackValidationError(
        "character.spritesheet_grid_invalid",
        "The PNG dimensions do not contain the declared fixed frame grid.",
      );
    }
    const warnings: string[] = [];
    if (manifest.metadata.commercialUse === "unknown") {
      warnings.push("Commercial-use permission is unknown.");
    }
    if (/^(unknown|unspecified|custom)$/i.test(manifest.metadata.license)) {
      warnings.push("The pack does not declare a recognized license identifier.");
    }
    return {
      archiveSha256: await sha256(path),
      manifest,
      previewDataUrl: `data:image/png;base64,${spritesheet.toString("base64")}`,
      spritesheet,
      warnings,
    };
  } catch (error: unknown) {
    if (error instanceof CharacterPackValidationError) throw error;
    throw new CharacterPackValidationError(
      "character.archive_invalid",
      error instanceof Error ? error.message : "The selected ZIP could not be read.",
    );
  } finally {
    zipFile?.close();
  }
}
