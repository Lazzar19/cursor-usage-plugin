import * as vscode from "vscode";
import { readAccessToken, resolveStateDbPath } from "./auth";
import { renderBar } from "./bar";
import { describeFailure, failureMessage, pollIntervalMs } from "./status";
import {
  fetchCurrentPeriodUsage,
  formatPercent,
  formatUsageDetails,
  UsageAbortedError,
  usagePercent,
  type CurrentPeriodUsage,
} from "./usage";

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
  let lastUsage: CurrentPeriodUsage | undefined;
  let inflight: AbortController | undefined;

  const refresh = async (): Promise<void> => {
    inflight?.abort();
    const current = new AbortController();
    inflight = current;

    const config = vscode.workspace.getConfiguration("cursorUsage");
    const segments = config.get<number>("barSegments", 8);
    const warningPercent = config.get<number>("warningPercent", 80);
    const criticalPercent = config.get<number>("criticalPercent", 95);
    const dbPath = resolveStateDbPath(config.get<string>("stateDbPath"));
    item.text = lastUsage ? spinningText(lastUsage, segments) : "$(sync~spin) Cursor";

    try {
      const token = await readAccessToken(dbPath);
      if (current.signal.aborted) {
        return;
      }
      const usage = await fetchCurrentPeriodUsage(token, { signal: current.signal });
      if (current.signal.aborted) {
        return;
      }
      lastUsage = usage;
      latestDetails = formatUsageDetails(usage);
      renderUsage(item, usage, segments, warningPercent, criticalPercent);
      writeDetails(output, latestDetails);
    } catch (error) {
      if (current.signal.aborted || error instanceof UsageAbortedError) {
        return;
      }
      const failure = describeFailure(error);
      const message = failureMessage(error);
      if (failure.keepLastSuccess && lastUsage) {
        renderUsage(item, lastUsage, segments, warningPercent, criticalPercent);
        item.text = `${item.text} · ${failure.label.replace(/^Cursor:\s*/, "")}`;
        item.tooltip = message;
      } else {
        item.text = failure.label;
        item.tooltip = message;
        item.backgroundColor = undefined;
      }
      output.clear();
      output.appendLine(failure.label);
      output.appendLine(message);
      if (failure.keepLastSuccess && latestDetails) {
        output.appendLine(latestDetails);
      }
    }
  };

  const refreshCommand = vscode.commands.registerCommand("cursorUsage.refresh", () => refresh());
  const showDetails = vscode.commands.registerCommand("cursorUsage.showDetails", () => {
    output.show(true);
  });
  const pollMs = pollIntervalMs(vscode.workspace.getConfiguration("cursorUsage").get<number>("pollIntervalSeconds"));
  const timer = setInterval(() => {
    void refresh();
  }, pollMs);

  context.subscriptions.push(output, item, refreshCommand, showDetails, {
    dispose: () => {
      clearInterval(timer);
      inflight?.abort();
    },
  });
  void refresh();
}

function spinningText(usage: CurrentPeriodUsage, segments: number): string {
  return statusText("$(sync~spin)", usage, segments);
}

function renderUsage(
  item: vscode.StatusBarItem,
  usage: CurrentPeriodUsage,
  segments: number,
  warningPercent: number,
  criticalPercent: number,
): void {
  const percent = usagePercent(usage.planUsage);
  item.text = statusText("$(pulse)", usage, segments);
  item.tooltip = formatUsageDetails(usage);
  item.backgroundColor = backgroundFor(percent, warningPercent, criticalPercent);
}

function statusText(icon: string, usage: CurrentPeriodUsage, segments: number): string {
  const percent = usagePercent(usage.planUsage);
  const bar = renderBar(percent, { segments, fillGlyph: FILL_GLYPH, emptyGlyph: EMPTY_GLYPH });
  return `${icon} Cursor ${bar} ${formatPercent(percent)}`;
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
