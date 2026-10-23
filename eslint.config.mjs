import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Allow the plain "useEffect(() => setMounted(true), [])" style of React.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The desktop wrapper is a separate Tauri project with its own tooling.
    "desktop/**",
    // The iPhone app is a separate Expo project with its own package.json and tooling.
    "mobile/**",
    // Cloudflare build output — generated, not source.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
