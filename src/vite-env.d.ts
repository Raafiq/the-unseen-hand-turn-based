/**
 * Asset module declarations.
 *
 * `tsconfig.json` sets `"types": ["node"]`, so `vite/client`'s ambient declarations are
 * NOT in scope and a bare `.svg` import fails `npm run typecheck`. Three lines here beat
 * pulling in `vite/client` wholesale, which would also drag in `import.meta.env` and the
 * `import.meta.glob` this repo deliberately does not use (`campaign-data.ts` must run
 * under plain Node as well as Vite).
 *
 * The import RESOLVES to a URL with Vite's `base` already applied — which is the whole
 * reason assets go through an import rather than a hand-written relative path. The Pages
 * sub-path becomes the bundler's problem, exactly as it already is for every JS chunk.
 */
declare module "*.svg" {
  const src: string;
  export default src;
}
