import * as vscode from "vscode";
import { readAccessToken, resolveStateDbPath } from "./auth";
import { describeFailure, pollIntervalMs, presentFailure, presentSpin, presentUsage, type UsageView } from "./status";
import { fetchCurrentPeriodUsage, UsageAbortedError, type CurrentPeriodUsage } from "./usage";

const VIEW_NAME = "Cursor Usage";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(VIEW_NAME);
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = VIEW_NAME;
  item.command = "cursorUsage.refresh";
  item.text = "$(pulse) Cursor —";
  item.tooltip = "Cursor usage is not loaded yet.";
  item.show();

  let lastUsage: CurrentPeriodUsage | undefined;
  let lastView: UsageView | undefined;
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
    item.text = presentSpin(lastUsage, segments);

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
      lastView = presentUsage(usage, segments, warningPercent, criticalPercent);
      applyView(item, lastView);
      writeOutput(output, lastView.output);
    } catch (error) {
      if (current.signal.aborted || error instanceof UsageAbortedError) {
        return;
      }
      const view = presentFailure(error, lastView);
      if (!describeFailure(error).keepLastSuccess) {
        lastUsage = undefined;
        lastView = undefined;
      }
      applyView(item, view);
      writeOutput(output, view.output);
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

function applyView(item: vscode.StatusBarItem, view: UsageView): void {
  item.text = view.text;
  item.tooltip = view.tooltip;
  item.backgroundColor = backgroundFor(view.level);
}

function backgroundFor(level: UsageView["level"]): vscode.ThemeColor | undefined {
  if (level === "critical") {
    return new vscode.ThemeColor("statusBarItem.errorBackground");
  }
  if (level === "warning") {
    return new vscode.ThemeColor("statusBarItem.warningBackground");
  }
  return undefined;
}

function writeOutput(output: vscode.OutputChannel, text: string): void {
  output.clear();
  output.appendLine(text);
}

export function deactivate(): void {}
