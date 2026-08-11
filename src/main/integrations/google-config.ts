import { promises as fs } from "node:fs";
import { join } from "node:path";

const KEY = "DESKTOP_PET_GOOGLE_CLIENT_ID";

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseGoogleClientId(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1 || line.slice(0, equals).trim() !== KEY) continue;
    const value = unquote(line.slice(equals + 1));
    return value.length === 0 ? null : value;
  }
  return null;
}

export async function loadGoogleClientId(
  appPath: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const configured = environment[KEY]?.trim();
  if (configured !== undefined && configured.length > 0) return configured;
  try {
    return parseGoogleClientId(await fs.readFile(join(appPath, ".env.local"), "utf8"));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
