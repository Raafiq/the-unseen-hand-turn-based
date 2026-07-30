import { defineConfig } from "vite";

// App build config for the thin render layer (src/render). The sim core stays
// framework-free; this only bundles the viewer that imports it.
//
// `base` is "/" for local dev/preview and is set to the repo path for the
// GitHub Pages deploy (a project site is served under /<repo>/). The Pages
// workflow passes PAGES_BASE.
export default defineConfig({
  base: process.env["PAGES_BASE"] ?? "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
