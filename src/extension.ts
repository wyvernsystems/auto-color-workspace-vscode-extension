import * as vscode from "vscode";

const CONFIG_SECTION = "auto-color";

type ChromeScope = "all" | "headFooter";

// ── Chrome bar keys (vibrant pastel, with computed foregrounds) ──────────────
const TITLE_BG = "titleBar.activeBackground" as const;
const TITLE_FG = "titleBar.activeForeground" as const;
const ACTIVITY_BG = "activityBar.background" as const;
const ACTIVITY_FG = "activityBar.foreground" as const;
const STATUS_BG = "statusBar.background" as const;
const STATUS_FG = "statusBar.foreground" as const;

const ALL_CHROME_KEYS = [
  TITLE_BG,
  TITLE_FG,
  ACTIVITY_BG,
  ACTIVITY_FG,
  STATUS_BG,
  STATUS_FG,
] as const;

// ── Surface keys (dark-tinted backgrounds only, NO foreground overrides) ─────
const SURFACE_BG_KEYS = [
  "sideBar.background",
  "sideBar.border",
  "sideBarSectionHeader.background",
  "list.activeSelectionBackground",
  "list.hoverBackground",
  "list.inactiveSelectionBackground",
  "editor.background",
  "editor.lineHighlightBackground",
  "editorGutter.background",
  "editorGroupHeader.tabsBackground",
  "editorGroupHeader.noTabsBackground",
  "tab.inactiveBackground",
  "tab.activeBackground",
  "tab.border",
  "panel.background",
  "panel.border",
  "terminal.background",
  "breadcrumb.background",
  "editorWidget.background",
  "editorGroup.border",
  "activityBar.border",
  "titleBar.border",
  "statusBar.border",
  "sideBarSectionHeader.border",
  "editorWidget.border",
  "tab.activeBorder",
  "welcomePage.background",
  "welcomePage.tileBackground",
  "walkThrough.embeddedEditorBackground",
  "editorGroup.emptyBackground",
  "editorPane.background",
  "textBlockQuote.background",
  "sideBarTitle.background",
  "panelTitle.activeBorder",
  "input.background",
  "dropdown.background",
  "quickInput.background",
  "notifications.background",
  "debugToolBar.background",
] as const;

const ALL_MANAGED_KEYS = [
  ...ALL_CHROME_KEYS,
  ...SURFACE_BG_KEYS,
] as const;

const DEPRECATED_COLOR_KEYS = [
  "sideBar.foreground",
  "sideBarSectionHeader.foreground",
  "list.activeSelectionForeground",
  "list.inactiveSelectionForeground",
  "editor.foreground",
  "editorLineNumber.foreground",
  "editorLineNumber.activeForeground",
  "tab.inactiveForeground",
  "tab.activeForeground",
] as const;

/** Lightness offset between title / activity / status (same hue). */
const SHADE_DL = 0.035;

function extensionSettings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function isGloballyEnabled(): boolean {
  return extensionSettings().get<boolean>("enabled", true);
}

function isWorkspaceDisabled(): boolean {
  return extensionSettings().get<boolean>("workspaceDisabled", false);
}

function getChromeScope(): ChromeScope {
  const v = extensionSettings().get<string>("scope");
  return v === "headFooter" ? "headFooter" : "all";
}

function getRandomSeed(): number | undefined {
  const v = extensionSettings().get<number>("randomSeed");
  return typeof v === "number" && v > 0 ? v : undefined;
}

function shouldApplyChrome(): boolean {
  return isGloballyEnabled() && !isWorkspaceDisabled();
}

/** Stable hash from workspace folder identity (path tail + full path salt). */
function hashWorkspaceIdentity(folderPath: string): number {
  const normalized = folderPath.replace(/\\/g, "/").toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const PHI_SQ = PHI * PHI;
const GOLDEN_ANGLE_DEG = 360 / PHI_SQ;
const INV_PHI = 1 / PHI;

function goldenBlend(a: number, b: number, c: number): number {
  const x = a / PHI + b / PHI_SQ + c / (PHI * PHI_SQ);
  return x - Math.floor(x);
}

function hashToUnitTriplet(hash: number): [number, number, number] {
  const h = hash >>> 0;
  const u0 = (h & 0xffffff) / 0xffffff;
  const u1 = ((Math.imul(h, 0x9e3779b9) >>> 0) & 0xffffff) / 0xffffff;
  const u2 = ((Math.imul(h, 0x85ebca6b) >>> 0) & 0xffffff) / 0xffffff;
  return [u0, u1, u2];
}

/** Base HSL for workspace chrome bars (vibrant pastels). */
function hashToPastelBase(hash: number): { h: number; s: number; l: number } {
  const hue = (hash * GOLDEN_ANGLE_DEG) % 360;
  const [u0, u1, u2] = hashToUnitTriplet(hash);

  const L_MIN = 0.52;
  const L_MAX = 0.7;
  const l = L_MIN + (L_MAX - L_MIN) * goldenBlend(u0, u1, u2);

  const S_MIN = 0.13;
  const S_MAX = 0.29;
  let s = S_MIN + (S_MAX - S_MIN) * goldenBlend(u1, u2, u0);
  const lNorm = (l - L_MIN) / (L_MAX - L_MIN);
  s *= 1 - lNorm * INV_PHI * 0.4;

  return { h: hue, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c);
  };
  const r = f(0);
  const g = f(8);
  const b = f(4);
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}

function byteHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastingForegroundHex(bgHex: string): string {
  const lum = relativeLuminance(bgHex);
  return lum > 0.45 ? "#1e1e1e" : "#f3f3f3";
}

function clampLightness(l: number): number {
  return Math.min(0.82, Math.max(0.42, l));
}

async function stripChromeFromWorkspace(): Promise<void> {
  const workbench = vscode.workspace.getConfiguration("workbench");
  const existing =
    workbench.get<Record<string, string | undefined>>("colorCustomizations") ??
    {};
  const next: Record<string, string | undefined> = { ...existing };
  for (const key of ALL_MANAGED_KEYS) {
    delete next[key];
  }
  for (const key of DEPRECATED_COLOR_KEYS) {
    delete next[key];
  }
  await workbench.update(
    "colorCustomizations",
    Object.keys(next).length ? next : {},
    vscode.ConfigurationTarget.Workspace,
  );
}

type Region = {
  bg: typeof TITLE_BG | typeof ACTIVITY_BG | typeof STATUS_BG;
  fg: typeof TITLE_FG | typeof ACTIVITY_FG | typeof STATUS_FG;
  bgHex: string;
};

async function paintWorkspaceChrome(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return;
  }

  const scope = getChromeScope();
  const primary = folders[0].uri.fsPath;
  const seed = getRandomSeed();
  const hash = seed ?? hashWorkspaceIdentity(primary);
  const { h, s, l } = hashToPastelBase(hash);

  // ── Vibrant chrome bars ───────────────────────────────────────────────
  const titleBgHex = hslToHex(h, s, clampLightness(l - SHADE_DL));
  const activityBgHex = hslToHex(h, s, clampLightness(l));
  const statusBgHex = hslToHex(h, s, clampLightness(l + SHADE_DL));

  // ── Dark-tinted surfaces: same hue, low saturation, native-relative offsets ─
  //
  // VS Code default dark theme lightness values (approximated):
  //   editor.background        #1e1e1e  L ≈ 0.118
  //   sideBar.background       #252526  L ≈ 0.145  (+0.027)
  //   sideBarSectionHeader     ~overlay               (+0.040)
  //   editorGroupHeader.tabs   #2d2d2d  L ≈ 0.176  (+0.058)
  //   tab.inactive             #2d2d2d                (+0.058)
  //   tab.active               #1e1e1e                ( 0    )
  //   panel / terminal         #1e1e1e                ( 0    )
  //   editorWidget             #252526                (+0.027)
  //   list.activeSelection     #04395e                (+0.050)
  //   list.hover               #2a2d2e                (+0.020)
  //   lineHighlight            very subtle             (+0.008)
  //   borders                  #444444  L ≈ 0.267  (+0.149)
  //
  // We keep those deltas and tint with the workspace hue.

  const tintS = Math.min(s * 1.6, 0.40);
  const editorL = 0.118;

  const surf = (sat: number, dl: number) => hslToHex(h, tintS * sat, editorL + dl);

  const editorBg          = surf(0.55, 0);
  const editorHighlightBg = surf(0.70, 0.008);
  const sidebarBg         = surf(1.00, 0.027);
  const sidebarSectionBg  = surf(1.00, 0.040);
  const tabsHeaderBg      = surf(0.65, 0.058);
  const tabInactiveBg     = surf(0.60, 0.058);
  const tabActiveBg       = editorBg;
  const panelBg           = surf(0.45, 0);
  const terminalBg        = editorBg;
  const breadcrumbBg      = surf(0.55, 0.005);
  const widgetBg          = surf(0.60, 0.027);
  const listActiveBg      = surf(1.10, 0.050);
  const listHoverBg       = surf(0.80, 0.020);
  const listInactiveBg    = surf(0.90, 0.028);
  const borderHex         = surf(0.40, 0.149);

  // ── Apply chrome regions (vibrant bars) ───────────────────────────────
  const regionsAll: Region[] = [
    { bg: TITLE_BG, fg: TITLE_FG, bgHex: titleBgHex },
    { bg: ACTIVITY_BG, fg: ACTIVITY_FG, bgHex: activityBgHex },
    { bg: STATUS_BG, fg: STATUS_FG, bgHex: statusBgHex },
  ];
  const regions: Region[] =
    scope === "all"
      ? regionsAll
      : regionsAll.filter((r) => r.bg !== ACTIVITY_BG);

  const activeBgKeys = new Set(regions.map((r) => r.bg));
  const activeFgKeys = new Set(regions.map((r) => r.fg));
  const activeKeys = new Set<string>([...activeBgKeys, ...activeFgKeys]);

  const workbench = vscode.workspace.getConfiguration("workbench");
  const existing =
    workbench.get<Record<string, string | undefined>>("colorCustomizations") ??
    {};

  const next: Record<string, string | undefined> = { ...existing };

  for (const key of DEPRECATED_COLOR_KEYS) {
    delete next[key];
  }
  for (const key of ALL_CHROME_KEYS) {
    if (!activeKeys.has(key)) {
      delete next[key];
    }
  }

  for (const r of regions) {
    next[r.bg] = r.bgHex;
    next[r.fg] = contrastingForegroundHex(r.bgHex);
  }

  if (scope === "all") {
    // ── Dark-tinted surfaces (head/footer-only scope skips these → theme defaults) ─
    next["sideBar.background"] = sidebarBg;
    next["sideBar.border"] = borderHex;
    next["sideBarSectionHeader.background"] = sidebarSectionBg;
    next["sideBarSectionHeader.border"] = borderHex;
    next["list.activeSelectionBackground"] = listActiveBg;
    next["list.hoverBackground"] = listHoverBg;
    next["list.inactiveSelectionBackground"] = listInactiveBg;
    next["editor.background"] = editorBg;
    next["editor.lineHighlightBackground"] = editorHighlightBg;
    next["editorGutter.background"] = editorBg;
    next["editorGroupHeader.tabsBackground"] = tabsHeaderBg;
    next["editorGroupHeader.noTabsBackground"] = tabsHeaderBg;
    next["tab.inactiveBackground"] = tabInactiveBg;
    next["tab.activeBackground"] = tabActiveBg;
    next["tab.border"] = borderHex;
    next["tab.activeBorder"] = borderHex;
    next["panel.background"] = panelBg;
    next["panel.border"] = borderHex;
    next["terminal.background"] = terminalBg;
    next["breadcrumb.background"] = breadcrumbBg;
    next["editorWidget.background"] = widgetBg;
    next["editorWidget.border"] = borderHex;
    next["editorGroup.border"] = borderHex;
    next["activityBar.border"] = borderHex;
    next["titleBar.border"] = borderHex;
    next["statusBar.border"] = borderHex;
    next["welcomePage.background"] = editorBg;
    next["welcomePage.tileBackground"] = sidebarBg;
    next["walkThrough.embeddedEditorBackground"] = editorBg;
    next["editorGroup.emptyBackground"] = editorBg;
    next["editorPane.background"] = editorBg;
    next["sideBarTitle.background"] = sidebarBg;
    next["panelTitle.activeBorder"] = borderHex;
    next["textBlockQuote.background"] = sidebarBg;
    next["input.background"] = sidebarBg;
    next["dropdown.background"] = sidebarBg;
    next["quickInput.background"] = widgetBg;
    next["notifications.background"] = widgetBg;
    next["debugToolBar.background"] = widgetBg;
  } else {
    for (const key of SURFACE_BG_KEYS) {
      delete next[key];
    }
  }

  await workbench.update(
    "colorCustomizations",
    next,
    vscode.ConfigurationTarget.Workspace,
  );
}

async function syncWorkspaceChrome(): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return;
  }
  if (shouldApplyChrome()) {
    await paintWorkspaceChrome();
  } else {
    await stripChromeFromWorkspace();
  }
}

function requireFolder(): boolean {
  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showInformationMessage(
      "Auto Color: open a folder in this window first.",
    );
    return false;
  }
  return true;
}

export function activate(context: vscode.ExtensionContext): void {
  void syncWorkspaceChrome();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void syncWorkspaceChrome();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      void syncWorkspaceChrome();
    }),
    vscode.commands.registerCommand(
      "auto-color.enableGlobal",
      async () => {
        await extensionSettings().update(
          "enabled",
          true,
          vscode.ConfigurationTarget.Global,
        );
        if (requireFolder()) {
          await syncWorkspaceChrome();
        }
      },
    ),
    vscode.commands.registerCommand(
      "auto-color.disableGlobal",
      async () => {
        await extensionSettings().update(
          "enabled",
          false,
          vscode.ConfigurationTarget.Global,
        );
        if (vscode.workspace.workspaceFolders?.length) {
          await stripChromeFromWorkspace();
        }
      },
    ),
    vscode.commands.registerCommand(
      "auto-color.enableWorkspace",
      async () => {
        if (!requireFolder()) {
          return;
        }
        await extensionSettings().update(
          "workspaceDisabled",
          false,
          vscode.ConfigurationTarget.Workspace,
        );
        if (isGloballyEnabled()) {
          await paintWorkspaceChrome();
        }
      },
    ),
    vscode.commands.registerCommand(
      "auto-color.disableWorkspace",
      async () => {
        if (!requireFolder()) {
          return;
        }
        await extensionSettings().update(
          "workspaceDisabled",
          true,
          vscode.ConfigurationTarget.Workspace,
        );
        await stripChromeFromWorkspace();
      },
    ),
    vscode.commands.registerCommand(
      "auto-color.randomize",
      async () => {
        if (!requireFolder()) {
          return;
        }
        const seed = (Math.random() * 0xffffffff) >>> 0;
        await extensionSettings().update(
          "randomSeed",
          seed,
          vscode.ConfigurationTarget.Workspace,
        );
        if (shouldApplyChrome()) {
          await paintWorkspaceChrome();
        }
      },
    ),
    vscode.commands.registerCommand(
      "auto-color.resetColor",
      async () => {
        if (!requireFolder()) {
          return;
        }
        await extensionSettings().update(
          "randomSeed",
          undefined,
          vscode.ConfigurationTarget.Workspace,
        );
        if (shouldApplyChrome()) {
          await paintWorkspaceChrome();
        }
      },
    ),
    vscode.commands.registerCommand(
      "auto-color.setScope",
      async () => {
        if (!requireFolder()) {
          return;
        }
        const current = getChromeScope();
        const picked = await vscode.window.showQuickPick(
          [
            {
              label: "All (title, activity, status)",
              description:
                "Default — color every chrome bar, with lightness shades",
              value: "all" as const,
              picked: current === "all",
            },
            {
              label: "Head and footer only",
              description:
                "Title + status only; activity bar and workbench tint use your theme",
              value: "headFooter" as const,
              picked: current === "headFooter",
            },
          ],
          {
            title: "Auto Color: Color scope",
            placeHolder: "Choose which bars get the workspace color",
          },
        );
        if (!picked) {
          return;
        }
        await extensionSettings().update(
          "scope",
          picked.value,
          vscode.ConfigurationTarget.Workspace,
        );
        if (shouldApplyChrome()) {
          await paintWorkspaceChrome();
        }
      },
    ),
  );
}

export function deactivate(): void {}
