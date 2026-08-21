import { resolve } from "node:path";
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
    // TWO PAGES, both shipped. `index.html` is the engine viewer (every internal
    // number on show); `game.html` is the playable campaign shell (docs/11 M0).
    // Adding an entry here is what makes it exist in the built site at all — a page
    // that only works under `npm run dev` is not shipped.
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        game: resolve(__dirname, "game.html"),
      },
    },
  },
});
