const assert = require("assert");
const vscode = require("vscode");

const EXTENSION_ID = "lazzar20.cursor-usage-plugin";

suite("Extension Development Host", function () {
  this.timeout(60000);

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, "extension is installed in the host");
    await extension.activate();
  });

  test("refresh fills the meter from included spend and keeps the token out of details", async () => {
    const view = await refreshSettled();
    assert.ok(view, "refresh returns the status view");
    assert.match(view.text, /^\$\(pulse\) Cursor [▓░]+ \d+% · Other [▓░]+ \d+%$/);
    assert.match(view.tooltip, /Cursor models \d+%/);
    assert.match(view.tooltip, /Other models \d+%/);
    assert.match(view.tooltip, /Included \$/);
    assert.match(view.tooltip, /Remaining \$/);
    assert.match(view.tooltip, /Limit \$/);
    assert.match(view.tooltip, /Cycle \d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}/);
    assert.strictEqual(view.output, view.tooltip);
    assertNoSecret(view.output);

    const shown = highestPercent(view.text);
    const cursorModels = Number(view.tooltip.match(/Cursor models (\d+)%/)[1]);
    const otherModels = Number(view.tooltip.match(/Other models (\d+)%/)[1]);
    assert.strictEqual(shown, Math.max(cursorModels, otherModels), "status color follows the higher model pool");
  });

  test("clicking refresh returns the meter again", async () => {
    const view = await vscode.commands.executeCommand("cursorUsage.refresh");
    assert.match(view.text, /\d+%$/);
    await vscode.commands.executeCommand("cursorUsage.showDetails");
  });

  test("lowering the thresholds below the current percent changes the level", async () => {
    const config = vscode.workspace.getConfiguration("cursorUsage");
    const target = vscode.ConfigurationTarget.Workspace;
    const current = await vscode.commands.executeCommand("cursorUsage.refresh");
    const shown = highestPercent(current.text);

    await config.update("warningPercent", shown + 10, target);
    await config.update("criticalPercent", shown + 20, target);
    const below = await vscode.commands.executeCommand("cursorUsage.refresh");
    assert.strictEqual(below.level, "normal");

    await config.update("warningPercent", Math.max(0, shown - 1), target);
    await config.update("criticalPercent", shown + 20, target);
    const warning = await vscode.commands.executeCommand("cursorUsage.refresh");
    assert.strictEqual(warning.level, shown === 0 ? "normal" : "warning");

    await config.update("criticalPercent", Math.max(0, shown - 1), target);
    const critical = await vscode.commands.executeCommand("cursorUsage.refresh");
    assert.strictEqual(critical.level, shown === 0 ? "normal" : "critical");

    await config.update("warningPercent", 80, target);
    await config.update("criticalPercent", 95, target);
  });

  test("a missing database asks to sign in without a stack or token", async () => {
    const config = vscode.workspace.getConfiguration("cursorUsage");
    const missing = "/tmp/cursor-usage-missing-state.vscdb";
    await config.update("stateDbPath", missing, vscode.ConfigurationTarget.Workspace);
    const view = await vscode.commands.executeCommand("cursorUsage.refresh");
    assert.strictEqual(view.text, "Cursor: sign in");
    assert.strictEqual(view.level, "normal");
    assert.match(view.output, /Cursor: sign in/);
    assert.match(view.output, /cursor-usage-missing-state\.vscdb/);
    assert.doesNotMatch(view.output, /at readAccessToken/);
    assertNoSecret(view.output);
    await config.update("stateDbPath", process.env.CURSOR_USAGE_STATE_DB, vscode.ConfigurationTarget.Workspace);
  });
});

async function refreshSettled() {
  let view;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    view = await vscode.commands.executeCommand("cursorUsage.refresh");
    if (view) {
      return view;
    }
  }
  return view;
}

function highestPercent(text) {
  const values = [...text.matchAll(/(\d+)%/g)].map((match) => Number(match[1]));
  assert.ok(values.length > 0, "status text contains a percent");
  return Math.max(...values);
}

function assertNoSecret(text) {
  assert.doesNotMatch(text, /authorization:\s*bearer/i);
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}/);
}
