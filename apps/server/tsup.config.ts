import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript source).
  noExternal: ["@clashagent/shared"],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
