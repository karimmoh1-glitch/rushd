// Desktop installers published by .github/workflows/desktop-release.yml.
// Only list a file here after confirming it exists on the release; the
// download page links to exactly these URLs.

export const DESKTOP_VERSION = "0.1.0";
const BASE = `https://github.com/karimmoh1-glitch/rushd/releases/download/desktop-v${DESKTOP_VERSION}`;

export interface DesktopAsset {
  os: "macOS" | "Windows";
  label: string;
  detail: string;
  file: string;
  url: string;
}

// Verified 2026-10-22: all three return 200 from the release; the .dmg passes
// `hdiutil verify` and holds a universal (arm64 + x86_64) app that launches.
const files: Omit<DesktopAsset, "url">[] = [
  { os: "macOS", label: "Download for Mac", detail: "macOS 10.15 or later · Apple silicon and Intel · 3 MB", file: "Rushd_0.1.0_darwin_universal.dmg" },
  { os: "Windows", label: "Download for Windows", detail: "Windows 10 or 11 · 64-bit installer · 1 MB", file: "Rushd_0.1.0_windows_x64-setup.exe" },
];

export const DESKTOP_ASSETS: DesktopAsset[] = files.map((f) => ({ ...f, url: `${BASE}/${f.file}` }));
export const DESKTOP_RELEASE_PAGE = `https://github.com/karimmoh1-glitch/rushd/releases/tag/desktop-v${DESKTOP_VERSION}`;
export const DESKTOP_SIGNED = false;
