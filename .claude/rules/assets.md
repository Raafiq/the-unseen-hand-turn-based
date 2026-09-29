---
paths:
  - "**/*.png"
---

# Image assets

`npm run check:assets` fails on any tracked media file over 3 MiB, and it reads the working tree, not the index.
Dense-hatch portrait PNGs land at 2.8-3.7 MB against that cap.
Re-encode them losslessly (Pillow `optimize=True`, pixel-identical) before staging.
