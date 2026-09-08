/* The overhaul look's glyphs, copied VERBATIM from `src/render/icons.ts` so the
   mockup and the shipped screen draw the same marks. Expands every
   `<i data-ico="sword"></i>` placeholder in the page into the same inline `<svg
   class="i">` the real `icon()` helper emits. */
const PATHS = {
  back: '<path d="M14.5 4.5 7 12l7.5 7.5"/>',
  chev: '<path d="M9 4.5 16.5 12 9 19.5"/>',
  star: '<path d="M12 1.6 13.5 10.4 22.4 12 13.5 13.6 12 22.4 10.5 13.6 1.6 12 10.5 10.4Z"/><path d="M12 5.6 12.9 11.1 18.4 12 12.9 12.9 12 18.4 11.1 12.9 5.6 12 11.1 11.1Z" transform="rotate(45 12 12)"/>',
  scroll: '<rect x="6" y="2.6" width="12" height="18.8" rx="1.6"/><path d="M9 7.4h6M9 11h6M9 14.6h4"/>',
  shield: '<path d="M12 2.4 20 5.4v6c0 5-3.6 8.4-8 10.2-4.4-1.8-8-5.2-8-10.2v-6Z"/>',
  counter: '<path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8"/><path d="M20.2 3.4V7.2h-3.8"/>',
  wing: '<path d="M2.6 15.4c5.2 0 9.4-2.2 12.4-6.4"/><path d="M4.8 19.4c6.2 0 11.4-3 14.6-8.4"/><path d="M15.4 8.6h5V3.4"/>',
  flag: '<path d="M6 21.5V3"/><path d="M6.9 4.4h11.4l-2.5 3.9 2.5 3.9H6.9Z" fill="currentColor" stroke="none"/><path d="M6.9 4.4h11.4l-2.5 3.9 2.5 3.9H6.9Z"/>',
  fleur:
    '<path d="M12 1.4c-2 2.7-2 4.8 0 6.6 2-1.8 2-3.9 0-6.6Z"/><path d="M11.1 8.6c-2.5-2.1-5.6-1.7-6.2.6-.5 2.1 1.3 3.8 3.3 3.4 1.3-.3 2.2-1.1 2.9-2.1Z"/><path d="M12.9 8.6c2.5-2.1 5.6-1.7 6.2.6.5 2.1-1.3 3.8-3.3 3.4-1.3-.3-2.2-1.1-2.9-2.1Z"/><rect x="7.4" y="12.3" width="9.2" height="1.6" rx=".6"/><path d="M11.1 13.9h1.8l-.35 5-.55 2-.55-2Z"/>',
  sword:
    '<path d="M20.5 3.5 10 14"/><path d="M17 3.5h3.5V7"/><path d="M7.2 12.8l4 4"/><path d="M8.6 15.4 5.2 18.8"/><circle cx="3.9" cy="20.1" r="1.5"/>',
  "c-archer": '<circle cx="12" cy="12" r="5.6"/><path d="M12 1.6v3.8M12 18.6v3.8M1.6 12h3.8M18.6 12h3.8"/>',
  "c-geomancer": '<path d="M1.8 20.4 9 6.6l4 6.6 3-4.4 6.2 11.6Z"/>',
  "c-monk": '<path d="M12 2.2 21.8 12 12 21.8 2.2 12Z"/><path d="M12 7.6 16.4 12 12 16.4 7.6 12Z" fill="currentColor"/>',
  "c-priest": '<path d="M9.8 1.8h4.4v6.4h6.4v4.4h-6.4v9.6H9.8v-9.6H3.4V8.2h6.4Z"/>',
  "c-knight": '<path d="M12 2.4 20 5.4v6c0 5-3.6 8.4-8 10.2-4.4-1.8-8-5.2-8-10.2v-6Z"/><path d="M7.6 8.4 16 16.4"/>',
  "c-wizard": '<path d="M12 1.6 13.5 10.4 22.4 12 13.5 13.6 12 22.4 10.5 13.6 1.6 12 10.5 10.4Z"/>',
};
const FILLED = new Set(["star", "flag", "fleur", "c-geomancer", "c-priest", "c-wizard"]);

for (const node of document.querySelectorAll("[data-ico]")) {
  const id = node.dataset.ico;
  const cls = node.dataset.icoClass ? `i ${node.dataset.icoClass}` : "i";
  const attrs = FILLED.has(id)
    ? 'viewBox="0 0 24 24" fill="currentColor"'
    : 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  node.outerHTML = `<svg class="${cls}" aria-hidden="true" ${attrs}>${PATHS[id]}</svg>`;
}
document.documentElement.dataset.iconsReady = "1";
