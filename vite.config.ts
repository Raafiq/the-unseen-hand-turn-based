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
    // THREE PAGES, all shipped. `index.html` is the playable campaign — the SITE
    // ROOT, because that is what a stranger should land on (docs/10 §7a).
    // `viewer.html` is the engine viewer, every internal number on show, a developer
    // instrument. `game.html` is a redirect stub keeping the campaign's former
    // public URL alive.
    //
    // Adding an entry here is what makes a page exist in the built site at all — one
    // that only works under `npm run dev` is not shipped, and nothing else says so.
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        viewer: resolve(__dirname, "viewer.html"),
        game: resolve(__dirname, "game.html"),
      },
    },
  },
});
