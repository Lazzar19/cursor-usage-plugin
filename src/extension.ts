import * as vscode from "vscode";
import { readAccessToken, resolveStateDbPath } from "./auth";
import { renderBar } from "./bar";
import { fetchCurrentPeriodUsage, formatPercent, formatUsageDetails, usagePercent, type CurrentPeriodUsage } from "./usage";

const VIEW_NAME = "Cursor Usage";
const FILL_GLYPH = "▓";
const EMPTY_GLYPH = "░";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(VIEW_NAME);
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = VIEW_NAME;
  item.command = "cursorUsage.refresh";
  item.text = "$(pulse) Cursor —";
  item.tooltip = "Cursor usage is not loaded yet.";
  item.show();

  let latestDetails: string | undefined;

  const refresh = vscode.commands.registerCommand("cursorUsage.refresh", async () => {
    const config = vscode.workspace.getConfiguration("cursorUsage");
    const segments = config.get<number>("barSegments", 8);
    const warningPercent = config.get<number>("warningPercent", 80);
    const criticalPercent = config.get<number>("criticalPercent", 95);
    const dbPath = resolveStateDbPath(config.get<string>("stateDbPath"));
    try {
      const token = await readAccessToken(dbPath);
      const usage = await fetchCurrentPeriodUsage(token);
      latestDetails = formatUsageDetails(usage);
      renderUsage(item, usage, segments, warningPercent, criticalPercent);
      writeDetails(output, latestDetails);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read Cursor usage.";
      output.clear();
      output.appendLine(message);
      void vscode.window.showErrorMessage(message);
    }
  });

  const showDetails = vscode.commands.registerCommand("cursorUsage.showDetails", () => {
    if (latestDetails) {
      writeDetails(output, latestDetails);
    }
    output.show(true);
  });

  context.subscriptions.push(output, item, refresh, showDetails);
}

function renderUsage(
  item: vscode.StatusBarItem,
  usage: CurrentPeriodUsage,
  segments: number,
  warningPercent: number,
  criticalPercent: number,
): void {
  const percent = usagePercent(usage.planUsage);
  const bar = renderBar(percent, { segments, fillGlyph: FILL_GLYPH, emptyGlyph: EMPTY_GLYPH });
  item.text = `$(pulse) Cursor ${bar} ${formatPercent(percent)}`;
  item.tooltip = formatUsageDetails(usage);
  item.backgroundColor = backgroundFor(percent, warningPercent, criticalPercent);
}

function backgroundFor(
  percent: number,
  warningPercent: number,
  criticalPercent: number,
): vscode.ThemeColor | undefined {
  if (percent >= criticalPercent) {
    return new vscode.ThemeColor("statusBarItem.errorBackground");
  }
  if (percent >= warningPercent) {
    return new vscode.ThemeColor("statusBarItem.warningBackground");
  }
  return undefined;
}

function writeDetails(output: vscode.OutputChannel, details: string): void {
  output.clear();
  output.appendLine(details);
}

export function deactivate(): void {}
