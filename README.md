# Cursor Usage

Status bar meters for the current Cursor billing period. One meter is the Cursor model pool (Composer, Vega, Grok, and the other models in the auto bucket). The other is the pool the Cursor dashboard labels **Other Models**.

The extension runs in the local Cursor UI, next to the sign-in database, including when the workspace itself is on WSL or SSH. It reads the session token from `state.vscdb` on this machine and asks Cursor for the current period. The token stays in memory and is never written to the status bar, the tooltip, or the output channel.

## What you see

After Cursor finishes starting, two items appear on the right side of the status bar:

```text
Cursor ▓░░░░░░░ 16%    Other ░░░░░░░░ 0%
```

| Item | Color | Dashboard meaning |
| --- | --- | --- |
| **Cursor** | Blue (`#5B9DFF`) | Included usage of Cursor models (`autoPercentUsed`) |
| **Other** | Amber (`#E8A838`) | Included usage of named API models, labeled Other Models (`apiPercentUsed`) |

`▓` is used spend and `░` is what is left in that pool. Hover either item for the dollar amounts, the billing-cycle dates, and the same sentences the dashboard shows. Click either item to refresh.

Each pool is colored on its own. At 80% that pool gets a warning background. At 95% it gets an error background. The other pool stays on its normal color. Both thresholds are settings.

The dollar included-spend limit and these two percents are different numbers. The tooltip can say the included dollar limit is already used while the model percents are still low. The bars follow the model percents.

## Requirements

- [Cursor](https://cursor.com) 1.85 or newer, signed in on this machine
- Node.js 20 or newer, only to build the extension from this repository

## Install

The extension is not published on the Marketplace. Build a VSIX and install that file into the **local** Cursor window.

### 1. Build the package

```bash
git clone https://github.com/Lazzar19/cursor-usage-plugin.git
cd cursor-usage-plugin
npm install
npx @vscode/vsce package --allow-missing-repository
```

That writes `cursor-usage-plugin-0.1.0.vsix` in the repository root.

### 2. Install it in Cursor

1. Open Cursor.
2. Open the Command Palette with `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS).
3. Run **Extensions: Install from VSIX...**.
4. Select `cursor-usage-plugin-0.1.0.vsix`.
5. Run **Developer: Reload Window**.

The meters show up after the reload, once the signed-in session can be read. The first paint can take a moment because the extension loads the database reader.

### 3. Confirm it is the UI copy

Open **Extensions**, find **Cursor Usage**, and check that it is enabled. Then look at the right side of the status bar.

If the status says `Cursor: sign in`, Cursor has no `cursorAuth/accessToken` in the database this window can see. Sign in to Cursor on this machine and run **Cursor Usage: Refresh**.

## WSL and remote windows

`extensionKind` is `["ui"]`. The extension must be installed in the window that owns the Cursor UI, not in the remote extension host.

Installing with the `cursor` command from a WSL terminal targets that remote host. Cursor then refuses the package:

```text
Cannot install the 'lazzar20.cursor-usage-plugin' extension because it is declared to not run in this setup.
```

Use **Extensions: Install from VSIX...** in the Cursor window instead. A workspace opened from WSL still shows the meters, because the UI extension runs on the Windows side and reads the Windows database:

```text
%APPDATA%\Cursor\User\globalStorage\state.vscdb
```

There is no separate copy under `~/.config/Cursor` inside WSL. If a future install needs the CLI, call the local Cursor executable, not the shell command that forwards into the remote host. On this machine that is `Cursor.exe` with `ELECTRON_RUN_AS_NODE=1`, pointed at `resources\app\out\cli.js`, and `--install-extension` given the VSIX path plus `--force`.

## Commands

| Command | What it does |
| --- | --- |
| **Cursor Usage: Refresh** | Reads the token again and fetches the current period. Also runs when you click a meter. |
| **Cursor Usage: Show Details** | Opens the **Cursor Usage** output channel with the same text as the tooltip. |

Refresh also runs when the window starts and then every five minutes.

## Settings

Search for `Cursor Usage` in Settings.

| Setting | Default | Meaning |
| --- | --- | --- |
| `cursorUsage.pollIntervalSeconds` | `300` | Seconds between refreshes. Values under 60 are raised to 60. |
| `cursorUsage.warningPercent` | `80` | Warning background for a pool at or above this percent. |
| `cursorUsage.criticalPercent` | `95` | Error background for a pool at or above this percent. |
| `cursorUsage.barSegments` | `8` | How many blocks each meter draws. Range 4–40. |
| `cursorUsage.stateDbPath` | empty | Absolute path to `state.vscdb`. Empty uses the platform default below. |

Default database locations:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux | `~/.config/Cursor/User/globalStorage/state.vscdb` |

If Cursor has the database open, the extension copies it to a temp file and reads the copy.

## Status text

| Text | Meaning |
| --- | --- |
| Blue and amber meters | The last successful read. |
| `Cursor: sign in` | The database or the access token is missing. The meters are cleared. |
| `Cursor: session expired` | Cursor rejected the token (`401` or `403`). Sign in again. The meters are cleared. |
| `usage unavailable` after the last meters | The network, the timeout, or the response shape failed. The last good meters stay up. |

A failed refresh does not print the token or the `Authorization` header.

## Develop

```bash
npm install
npm test
```

`npm test` compiles TypeScript and runs the token, parser, status, and view checks. `npm run watch` recompiles on save. **Run Extension** in the Run and Debug view opens an Extension Development Host.

`npm run test:host` launches that host against the signed-in Cursor database and checks the live meters, a threshold change, and a missing-database sign-in state. It downloads a VS Code test build on first run.

Layout:

- `src/extension.ts` — activation, the two status items, polling
- `src/auth.ts` — read-only token load from `state.vscdb`
- `src/usage.ts` — current-period request and parsing
- `src/status.ts` — meter text, pool colors, and failure text
- `src/bar.ts` — the block meter

## Limits

Usage comes from Cursor's current-period dashboard call, `GetCurrentPeriodUsage`. That call is undocumented and can change. The extension treats a missing model percent as unknown rather than zero, and it keeps an explicit `0`.

This does not list individual requests, and it does not add a bar to the Agents window. Those are outside this version.
