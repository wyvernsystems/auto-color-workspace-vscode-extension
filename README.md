# AutoColorWorkspace

Give every VS Code workspace its own **calm, readable chrome**: the extension hashes the folder path, builds a **golden-ratio pastel** (hue via 360°/φ², blended saturation/lightness), and writes `workbench.colorCustomizations` to **`.vscode/settings.json`** so colors survive restarts.

Works in **VS Code** and **Cursor**.

## Install

**From the Marketplace (after you publish):** search for **AutoColorWorkspace** or open  
[AutoColorWorkspace on the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ronpicard.autocolor-workspace)  
*(Link works once the extension is published under publisher `ronpicard`.)*

**From a VSIX:** download or build `autocolor-workspace-0.1.0.vsix`, then in VS Code: **Extensions → … → Install from VSIX…**.

## Requirements

- VS Code **1.85.0** or newer (see `engines.vscode` in `package.json`).

## Behavior

- Runs on window startup and when workspace folders change—no command required for the default flow.
- Uses the **first** workspace root path for the hash (multi-root: same behavior as before).
- Command Palette (**⌘⇧P** / **Ctrl+Shift+P**) exposes enable/disable/reset commands (see below).

## Commands

| Command | Effect |
|--------|--------|
| **AutoColorWorkspace: Enable (all windows)** | Master switch on; re-applies chrome in this workspace if a folder is open. |
| **AutoColorWorkspace: Disable (all windows)** | Master switch off; clears extension bar keys in **this** workspace. |
| **AutoColorWorkspace: Enable for this workspace** | Clears workspace-only disable; paints if the master switch is on. |
| **AutoColorWorkspace: Disable for this workspace** | Workspace-only off; removes extension bar keys here. |
| **AutoColorWorkspace: Reset colors (this workspace)** | Removes only this extension’s keys; does not change enable flags. |

## Settings

| ID | Scope | Default | Meaning |
|----|--------|---------|---------|
| `autocolor-workspace.enabled` | Application | `true` | Global on/off. |
| `autocolor-workspace.workspaceDisabled` | Window | `false` | Off for this workspace only. |

## Features

- Deterministic color from the workspace folder path  
- Golden-angle hue spacing and φ-weighted S/L for restrained UI chrome  
- Contrasting foregrounds for title, activity, and status bars  
- Merges with existing `workbench.colorCustomizations` (only touches the keys it owns)

## Development

```bash
npm install
npm run compile
```

Press **F5** in this repo to open an Extension Development Host (see `.vscode/launch.json`).

## Maintainer: publish to the Visual Studio Marketplace

1. **Align identity**  
   - In [Manage publishers](https://marketplace.visualstudio.com/manage), create a publisher and note the **publisher ID**.  
   - Set `"publisher"` in `package.json` to that exact ID (this repo currently uses `ronpicard` for the Marketplace listing; **change it** if you publish under another publisher).  
   - Source code for this extension lives at [github.com/wyvernsystems/auto-color-workspace-vscode-extension](https://github.com/wyvernsystems/auto-color-workspace-vscode-extension); `repository`, `bugs`, and `homepage` in `package.json` should stay in sync with that URL.

2. **Personal Access Token**  
   - In [Azure DevOps](https://dev.azure.com), create a PAT with scope **Marketplace → Manage**.  
   - Official guide: [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

3. **Ship**  
   ```bash
   npm install
   npm run compile
   npx vsce login <your-publisher-id>
   npx vsce publish
   ```  
   For updates, bump `"version"` in `package.json` (or use `npx vsce publish patch`), update `CHANGELOG.md`, then `npx vsce publish` again.

4. **Sanity check locally**  
   ```bash
   npx vsce package
   ```  
   Produces `autocolor-workspace-<version>.vsix` for a test install.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
