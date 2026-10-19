import * as vscode from "vscode";
import { resolveStateDbPath } from "./auth";
import { renderBar } from "./bar";
import { formatPercent } from "./usage";

const VIEW_NAME = "Cursor Usage";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(VIEW_NAME);
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = VIEW_NAME;
  item.command = "cursorUsage.refresh";
  item.text = "$(pulse) Cursor —";
  item.tooltip = "Cursor usage is not loaded yet.";
  item.show();

  const refresh = vscode.commands.registerCommand("cursorUsage.refresh", () => {
    const config = vscode.workspace.getConfiguration("cursorUsage");
    const segments = config.get<number>("barSegments", 8);
    const dbPath = resolveStateDbPath(config.get<string>("stateDbPath"));
    output.clear();
    output.appendLine(`state.vscdb: ${dbPath}`);
    output.appendLine(`meter preview: ${renderBar(0, { segments, fillGlyph: "▓", emptyGlyph: "░" })} ${formatPercent(0)}`);
    output.appendLine("Usage refresh is not implemented yet.");
    void vscode.window.showInformationMessage("Cursor usage refresh is not implemented yet.");
  });

  const showDetails = vscode.commands.registerCommand("cursorUsage.showDetails", () => {
    output.show(true);
  });

  context.subscriptions.push(output, item, refresh, showDetails);
}

export function deactivate(): void {}
