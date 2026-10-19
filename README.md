# Cursor Usage

VS Code extension that will show Cursor plan usage in the editor status bar. This repository currently contains the project skeleton: it compiles, activates, and registers the status bar item and commands. It does not read a session token or call the usage API yet.

The extension is marked `extensionKind: ["ui"]` so it runs in the local UI host, next to the Cursor sign-in database, including when the workspace itself is on WSL or SSH.

## Requirements

- Node.js 20 or newer
- Cursor or VS Code 1.85 or newer

## Scripts

```bash
npm install
npm run compile
```

`npm run watch` recompiles on save. The default build task in this workspace runs that watcher.

## Run in an Extension Development Host

1. Open this folder in Cursor.
2. Run **Run Extension** from the Run and Debug view.

The host window shows a `Cursor —` status item. **Cursor Usage: Refresh** writes the resolved `state.vscdb` path to the **Cursor Usage** output channel and reports that fetching is not implemented. **Cursor Usage: Show Details** opens that channel.

## Layout

- `src/extension.ts` — activation, status bar, commands
- `src/auth.ts` — `state.vscdb` path resolution and the token read entry point
- `src/usage.ts` — usage types and the fetch entry point
- `src/bar.ts` — percent clamping and the text meter
