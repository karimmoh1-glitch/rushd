// Desktop installers published by .github/workflows/desktop-release.yml.
// Only list a file here after confirming it exists on the release; the
// download page links to exactly these URLs.

export const DESKTOP_VERSION = "0.1.1";
const BASE = `https://github.com/karimmoh1-glitch/rushd/releases/download/desktop-v${DESKTOP_VERSION}`;

export interface DesktopAsset {
  os: "macOS" | "Windows";
  label: string;
  detail: string;
  file: string;
  url: string;
}

// Verified 2026-10-22 (0.1.1): both files download from the release; the .dmg
// passes `hdiutil verify` and holds a universal (arm64 + x86_64) app that
// launches, with the Rushd mark as its icon. The .exe is an NSIS installer.
const MAC_FILE = "Rushd_0.1.1_darwin_universal.dmg";
const WINDOWS_FILE = "Rushd_0.1.1_windows_x64-setup.exe";

export const DESKTOP_ASSETS: DesktopAsset[] = [
  {
    os: "macOS",
    label: "Download for Mac",
    detail: "macOS 10.15 or later · Apple silicon and Intel · 3 MB",
    file: MAC_FILE,
    url: `${BASE}/${MAC_FILE}`,
  },
  {
    os: "Windows",
    label: "Download for Windows",
    detail: "Windows 10 or 11 · 64-bit installer · 1 MB",
    file: WINDOWS_FILE,
    url: `${BASE}/${WINDOWS_FILE}`,
  },
];
export const DESKTOP_RELEASE_PAGE = `https://github.com/karimmoh1-glitch/rushd/releases/tag/desktop-v${DESKTOP_VERSION}`;
export const DESKTOP_SIGNED = false;
