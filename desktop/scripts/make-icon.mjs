// Renders the app icon source (1024x1024 PNG) from src-tauri/icons/source.svg,
// the Rushd mark on warm ink. Uses sharp from the web app's dependencies.
// Then run `npm run icons` to produce every platform size.
//
// Usage: node scripts/make-icon.mjs [out.png]   (default: src-tauri/icons/source.png)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../package.json"));
const sharp = require("sharp");

const svg = readFileSync(resolve(here, "../src-tauri/icons/source.svg"));
const out = resolve(process.argv[2] ?? resolve(here, "../src-tauri/icons/source.png"));
await sharp(svg, { density: 300 }).resize(1024, 1024).png().toFile(out);
console.log(`wrote ${out}`);
