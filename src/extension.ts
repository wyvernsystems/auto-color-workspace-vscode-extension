import * as vscode from "vscode";

const CONFIG_SECTION = "autocolor-workspace";

const COLOR_KEYS = [
  "titleBar.activeBackground",
  "activityBar.background",
  "statusBar.background",
] as const;

const FOREGROUND_KEYS = [
  "titleBar.activeForeground",
  "activityBar.foreground",
  "statusBar.foreground",
] as const;

const ALL_CHROME_KEYS = [...COLOR_KEYS, ...FOREGROUND_KEYS] as const;

function extensionSettings(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function isGloballyEnabled(): boolean {
  return extensionSettings().get<boolean>("enabled", true);
}

function isWorkspaceDisabled(): boolean {
  return extensionSettings().get<boolean>("workspaceDisabled", false);
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

/** φ and φ² for golden-ratio palettes (harmonious spacing, restrained mixes). */
const PHI = (1 + Math.sqrt(5)) / 2;
const PHI_SQ = PHI * PHI;
/** Degrees: golden angle 360°/φ² — well-separated hues from nearby hashes (phyllotaxis). */
const GOLDEN_ANGLE_DEG = 360 / PHI_SQ;
const INV_PHI = 1 / PHI;

/** Low-discrepancy mix in [0,1) from unit samples (golden-ratio sequence style). */
function goldenBlend(a: number, b: number, c: number): number {
  const x = a / PHI + b / PHI_SQ + c / (PHI * PHI_SQ);
  return x - Math.floor(x);
}

/** Three decorrelated [0,1) samples from a 32-bit hash. */
function hashToUnitTriplet(hash: number): [number, number, number] {
  const h = hash >>> 0;
  const u0 = (h & 0xffffff) / 0xffffff;
  const u1 = (Math.imul(h, 0x9e3779b9) >>> 0 & 0xffffff) / 0xffffff;
  const u2 = (Math.imul(h, 0x85ebca6b) >>> 0 & 0xffffff) / 0xffffff;
  return [u0, u1, u2];
}

/**
 * Professional muted chrome: hue via golden angle, S/L via φ-weighted blends
 * in tight ranges (calm saturation, mid–high lightness for readable labels).
 */
function hashToPastelHex(hash: number): string {
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

  return hslToHex(hue, s, l);
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

/** Relative luminance (sRGB), WCAG. */
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

async function stripChromeFromWorkspace(): Promise<void> {
  const workbench = vscode.workspace.getConfiguration("workbench");
  const existing =
    workbench.get<Record<string, string | undefined>>("colorCustomizations") ??
    {};
  const next: Record<string, string | undefined> = { ...existing };
  for (const key of ALL_CHROME_KEYS) {
    delete next[key];
  }
  await workbench.update(
    "colorCustomizations",
    Object.keys(next).length ? next : {},
    vscode.ConfigurationTarget.Workspace
  );
}

/** Apply bar/foreground keys (only when `shouldApplyChrome()` is true). */
async function paintWorkspaceChrome(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return;
  }

  const primary = folders[0].uri.fsPath;
  const hash = hashWorkspaceIdentity(primary);
  const bg = hashToPastelHex(hash);
  const fg = contrastingForegroundHex(bg);

  const workbench = vscode.workspace.getConfiguration("workbench");
  const existing =
    workbench.get<Record<string, string | undefined>>("colorCustomizations") ??
    {};

  const next: Record<string, string | undefined> = { ...existing };
  for (const key of COLOR_KEYS) {
    next[key] = bg;
  }
  for (const key of FOREGROUND_KEYS) {
    next[key] = fg;
  }

  await workbench.update(
    "colorCustomizations",
    next,
    vscode.ConfigurationTarget.Workspace
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
      "AutoColorWorkspace: open a folder in this window first."
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
    vscode.commands.registerCommand("autocolor-workspace.enableGlobal", async () => {
      await extensionSettings().update(
        "enabled",
        true,
        vscode.ConfigurationTarget.Global
      );
      if (requireFolder()) {
        await syncWorkspaceChrome();
      }
    }),
    vscode.commands.registerCommand("autocolor-workspace.disableGlobal", async () => {
      await extensionSettings().update(
        "enabled",
        false,
        vscode.ConfigurationTarget.Global
      );
      if (vscode.workspace.workspaceFolders?.length) {
        await stripChromeFromWorkspace();
      }
    }),
    vscode.commands.registerCommand("autocolor-workspace.enableWorkspace", async () => {
      if (!requireFolder()) {
        return;
      }
      await extensionSettings().update(
        "workspaceDisabled",
        false,
        vscode.ConfigurationTarget.Workspace
      );
      if (isGloballyEnabled()) {
        await paintWorkspaceChrome();
      }
    }),
    vscode.commands.registerCommand("autocolor-workspace.disableWorkspace", async () => {
      if (!requireFolder()) {
        return;
      }
      await extensionSettings().update(
        "workspaceDisabled",
        true,
        vscode.ConfigurationTarget.Workspace
      );
      await stripChromeFromWorkspace();
    }),
    vscode.commands.registerCommand("autocolor-workspace.resetWorkspaceColors", async () => {
      if (!requireFolder()) {
        return;
      }
      await stripChromeFromWorkspace();
    })
  );
}

export function deactivate(): void {}
