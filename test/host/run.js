const fs = require("fs");
const os = require("os");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

const root = path.resolve(__dirname, "../..");

function findStateDb() {
  const candidates = [
    path.join(os.homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
    "/mnt/c/Users/LAZAR/AppData/Roaming/Cursor/User/globalStorage/state.vscdb",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function main() {
  const stateDb = findStateDb();
  if (!stateDb) {
    throw new Error("Cursor state.vscdb was not found for the host test.");
  }

  const workspace = path.join(root, "test/host/workspace");
  const vscodeDir = path.join(workspace, ".vscode");
  fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(
    path.join(vscodeDir, "settings.json"),
    JSON.stringify(
      {
        "cursorUsage.stateDbPath": stateDb,
        "cursorUsage.warningPercent": 80,
        "cursorUsage.criticalPercent": 95,
        "cursorUsage.pollIntervalSeconds": 3600,
      },
      null,
      2,
    ),
  );

  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(__dirname, "index.js"),
    extensionTestsEnv: {
      CURSOR_USAGE_STATE_DB: stateDb,
    },
    launchArgs: [workspace, "--disable-gpu", "--no-sandbox"],
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
