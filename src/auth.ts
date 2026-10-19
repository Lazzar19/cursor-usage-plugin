import * as os from "os";
import * as path from "path";

export const ACCESS_TOKEN_KEY = "cursorAuth/accessToken";

export class AuthNotReadyError extends Error {
  constructor() {
    super("Reading the Cursor access token is not implemented yet.");
    this.name = "AuthNotReadyError";
  }
}

export function defaultStateDbPath(
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
  appData: string | undefined = process.env.APPDATA,
): string {
  const storage = path.join("Cursor", "User", "globalStorage", "state.vscdb");
  if (platform === "win32") {
    const roaming = appData ?? path.join(home, "AppData", "Roaming");
    return path.join(roaming, storage);
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", storage);
  }
  return path.join(home, ".config", storage);
}

export function resolveStateDbPath(configuredPath: string | undefined): string {
  const trimmed = configuredPath?.trim();
  if (trimmed) {
    return trimmed;
  }
  return defaultStateDbPath();
}

export function readAccessToken(_dbPath: string): Promise<string> {
  return Promise.reject(new AuthNotReadyError());
}
