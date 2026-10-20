import { createRequire } from "node:module";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const { readAccessToken, AccessTokenNotFoundError, StateDbNotFoundError } = require("../out/auth.js");

const SQL = await initSqlJs({
  locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
});

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

async function withDatabase(setup, run) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cursor-usage-test-"));
  const dbPath = path.join(directory, "state.vscdb");
  const db = new SQL.Database();
  try {
    setup(db);
    await fs.promises.writeFile(dbPath, Buffer.from(db.export()));
  } finally {
    db.close();
  }
  try {
    await run(dbPath);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

await withDatabase(
  (db) => {
    db.run("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
    db.run("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ["cursorAuth/accessToken", "test-token"]);
  },
  async (dbPath) => {
    const token = await readAccessToken(dbPath);
    assert(token === "test-token", "reads a text token");
  },
);

await withDatabase(
  (db) => {
    db.run("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
    db.run("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ["cursorAuth/accessToken", JSON.stringify("quoted-token")]);
  },
  async (dbPath) => {
    const token = await readAccessToken(dbPath);
    assert(token === "quoted-token", "unwraps a JSON string token");
  },
);

await withDatabase(
  (db) => {
    db.run("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
  },
  async (dbPath) => {
    try {
      await readAccessToken(dbPath);
      assert(false, "empty table should fail");
    } catch (error) {
      assert(error instanceof AccessTokenNotFoundError, "empty table raises AccessTokenNotFoundError");
    }
  },
);

try {
  await readAccessToken(path.join(os.tmpdir(), "cursor-usage-missing-state.vscdb"));
  assert(false, "missing file should fail");
} catch (error) {
  assert(error instanceof StateDbNotFoundError, "missing file raises StateDbNotFoundError");
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("read-token: ok");
}
