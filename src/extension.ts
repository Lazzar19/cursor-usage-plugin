import * as vscode from "vscode";
import { readAccessToken, resolveStateDbPath } from "./auth";
import { describeFailure, pollIntervalMs, presentFailure, presentSpin, presentUsage, type UsageView } from "./status";
import { fetchCurrentPeriodUsage, UsageAbortedError, type CurrentPeriodUsage } from "./usage";

const VIEW_NAME = "Cursor Usage";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(VIEW_NAME);
  const cursorItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  const otherItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const items = { cursor: cursorItem, other: otherItem };
  for (const item of [cursorItem, otherItem]) {
    item.name = VIEW_NAME;
    item.command = "cursorUsage.refresh";
  }
  cursorItem.text = "$(pulse) Cursor —";
  cursorItem.tooltip = "Cursor usage is not loaded yet.";
  cursorItem.show();

  let lastUsage: CurrentPeriodUsage | undefined;
  let lastView: UsageView | undefined;
  let inflight: AbortController | undefined;

  const refresh = async (): Promise<UsageView | undefined> => {
    inflight?.abort();
    const current = new AbortController();
    inflight = current;

    const config = vscode.workspace.getConfiguration("cursorUsage");
    const segments = config.get<number>("barSegments", 8);
    const warningPercent = config.get<number>("warningPercent", 80);
    const criticalPercent = config.get<number>("criticalPercent", 95);
    const dbPath = resolveStateDbPath(config.get<string>("stateDbPath"));
    applyView(items, presentSpin(lastUsage, segments, warningPercent, criticalPercent));

    try {
      const token = await readAccessToken(dbPath);
      if (current.signal.aborted) {
        return undefined;
      }
      const usage = await fetchCurrentPeriodUsage(token, { signal: current.signal });
      if (current.signal.aborted) {
        return undefined;
      }
      lastUsage = usage;
      lastView = presentUsage(usage, segments, warningPercent, criticalPercent);
      applyView(items, lastView);
      writeOutput(output, lastView.output);
      return lastView;
    } catch (error) {
      if (current.signal.aborted || error instanceof UsageAbortedError) {
        return undefined;
      }
      const view = presentFailure(error, lastView);
      if (!describeFailure(error).keepLastSuccess) {
        lastUsage = undefined;
        lastView = undefined;
      }
      applyView(items, view);
      writeOutput(output, view.output);
      return view;
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

  context.subscriptions.push(output, cursorItem, otherItem, refreshCommand, showDetails, {
    dispose: () => {
      clearInterval(timer);
      inflight?.abort();
    },
  });
  void refresh();
}

function applyView(items: Record<"cursor" | "other", vscode.StatusBarItem>, view: UsageView): void {
  const shown = new Map(view.pools.map((pool) => [pool.key, pool]));
  for (const key of ["cursor", "other"] as const) {
    const item = items[key];
    const pool = shown.get(key);
    if (!pool) {
      item.hide();
      continue;
    }
    item.text = pool.text;
    item.tooltip = view.tooltip;
    item.color = pool.color ?? undefined;
    item.backgroundColor = backgroundFor(pool.level);
    item.show();
  }
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
