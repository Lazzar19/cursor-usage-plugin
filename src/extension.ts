import * as vscode from "vscode";
import { readAccessToken, resolveStateDbPath } from "./auth";
import { renderBar } from "./bar";
import { fetchCurrentPeriodUsage, formatPercent } from "./usage";

const VIEW_NAME = "Cursor Usage";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(VIEW_NAME);
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = VIEW_NAME;
  item.command = "cursorUsage.refresh";
  item.text = "$(pulse) Cursor —";
  item.tooltip = "Cursor usage is not loaded yet.";
  item.show();

  const refresh = vscode.commands.registerCommand("cursorUsage.refresh", async () => {
    const config = vscode.workspace.getConfiguration("cursorUsage");
    const segments = config.get<number>("barSegments", 8);
    const dbPath = resolveStateDbPath(config.get<string>("stateDbPath"));
    output.clear();
    output.appendLine(`state.vscdb: ${dbPath}`);
    output.appendLine(`meter preview: ${renderBar(0, { segments, fillGlyph: "▓", emptyGlyph: "░" })} ${formatPercent(0)}`);
    try {
      const token = await readAccessToken(dbPath);
      output.appendLine(`access token: ok (${token.length} chars)`);
      const usage = await fetchCurrentPeriodUsage(token);
      const percent = formatPercent(usage.planUsage.totalPercentUsed);
      output.appendLine(`usage: ${percent}`);
      output.appendLine(`included spend cents: ${usage.planUsage.includedSpendCents}`);
      output.appendLine(`remaining cents: ${usage.planUsage.remainingCents ?? "—"}`);
      output.appendLine(`limit cents: ${usage.planUsage.limitCents}`);
      output.appendLine(`cycle ms: ${usage.billingCycleStartMs ?? "—"} .. ${usage.billingCycleEndMs ?? "—"}`);
      if (usage.spendLimitUsage?.totalSpendCents != null) {
        output.appendLine(`on-demand spend cents: ${usage.spendLimitUsage.totalSpendCents}`);
      }
      if (usage.displayMessage) {
        output.appendLine(usage.displayMessage);
      }
      void vscode.window.showInformationMessage(`Cursor usage ${percent}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read the Cursor access token.";
      output.appendLine(message);
      void vscode.window.showErrorMessage(message);
    }
  });

  const showDetails = vscode.commands.registerCommand("cursorUsage.showDetails", () => {
    output.show(true);
  });

  context.subscriptions.push(output, item, refresh, showDetails);
}

export function deactivate(): void {}
