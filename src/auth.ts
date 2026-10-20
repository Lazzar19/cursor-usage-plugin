import { createRequire } from "node:module";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import initSqlJs from "sql.js";

const nodeRequire = createRequire(__filename);

export const ACCESS_TOKEN_KEY = "cursorAuth/accessToken";

const LOCK_CODES = new Set(["EBUSY", "EPERM", "EACCES", "UNKNOWN"]);

export class StateDbNotFoundError extends Error {
  constructor(dbPath: string) {
    super(`Cursor state database was not found at ${dbPath}.`);
    this.name = "StateDbNotFoundError";
  }
}

export class AccessTokenNotFoundError extends Error {
  constructor() {
    super("Cursor access token was not found. Sign in to Cursor on this machine.");
    this.name = "AccessTokenNotFoundError";
  }
}

export class AuthReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthReadError";
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

let sqlPromise: ReturnType<typeof initSqlJs> | undefined;

function loadSql(): ReturnType<typeof initSqlJs> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => nodeRequire.resolve(`sql.js/dist/${file}`),
    });
  }
  return sqlPromise;
}

export async function readAccessToken(dbPath: string): Promise<string> {
  const bytes = await readDatabaseBytes(dbPath);
  const SQL = await loadSql();
  let db: InstanceType<(typeof SQL)["Database"]> | undefined;
  try {
    db = new SQL.Database(bytes);
    const statement = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
    try {
      statement.bind([ACCESS_TOKEN_KEY]);
      if (!statement.step()) {
        throw new AccessTokenNotFoundError();
      }
      const token = tokenFromCell(statement.getAsObject().value);
      if (!token) {
        throw new AccessTokenNotFoundError();
      }
      return token;
    } finally {
      statement.free();
    }
  } catch (error) {
    if (error instanceof AccessTokenNotFoundError || error instanceof AuthReadError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("no such table")) {
      throw new AccessTokenNotFoundError();
    }
    throw new AuthReadError("Cursor state database could not be opened.");
  } finally {
    db?.close();
  }
}

async function readDatabaseBytes(dbPath: string): Promise<Uint8Array> {
  try {
    return await readFileBytes(dbPath);
  } catch (error) {
    if (isEnoent(error)) {
      throw new StateDbNotFoundError(dbPath);
    }
    if (isLockError(error)) {
      return readLockedCopy(dbPath);
    }
    throw new AuthReadError("Could not read the Cursor state database.");
  }
}

async function readLockedCopy(dbPath: string): Promise<Uint8Array> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cursor-usage-"));
  const copyPath = path.join(directory, "state.vscdb");
  try {
    await fs.promises.copyFile(dbPath, copyPath);
    return await readFileBytes(copyPath);
  } catch (error) {
    if (isEnoent(error)) {
      throw new StateDbNotFoundError(dbPath);
    }
    throw new AuthReadError("Could not read the Cursor state database because the file is locked.");
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function readFileBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await fs.promises.readFile(filePath));
}

function tokenFromCell(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeToken(value);
  }
  if (value instanceof Uint8Array) {
    return normalizeToken(Buffer.from(value).toString("utf8"));
  }
  return undefined;
}

function normalizeToken(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string" && parsed.trim()) {
        return parsed.trim();
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function isEnoent(error: unknown): boolean {
  return isErrno(error, "ENOENT");
}

function isLockError(error: unknown): boolean {
  return error instanceof Error && "code" in error && LOCK_CODES.has(String(error.code));
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
