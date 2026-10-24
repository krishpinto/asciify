# asciify

Image → ASCII art, in the browser. One page, no account, nothing uploaded.

```bash
npm install
npm run dev
```

## What it does

1. Drop, pick or paste an image.
2. **Make it for** a phone wallpaper, desktop wallpaper, square or portrait post, story, X header, or a custom size. That locks the crop to the right shape (adjust it with Crop), picks a column count that gives readable characters at that size (Detail: bold / normal / fine), and exports exactly those pixels. Free keeps the image's own shape.
3. Pick a style, or type any text and it becomes the character ramp (sorted by how much ink each character has).
4. Fix what you don't like: brushes (erase, restore, lighter, darker, paint an alphabet, paint a colour, stamp a character) or edit the result as plain text.
5. Export PNG, SVG, or text. Or copy the text. Columns, cell shape and the tonal knobs live under Advanced.

## How it works

Everything is in `lib/ascii.ts` and runs on the CPU:

- `sampleImage()` downsamples the image to one pixel per character cell (two-step scaling so big photos don't alias) and keeps a brightness and a colour per cell.
- `compose()` turns that into one character and one colour per cell using the settings (ramp, gamma, invert, contour, shade…) **and the user's edits**. Edits live in `Overrides`, one slot per cell, so they survive style changes and undo is just a copy.
- `render()` draws the grid to a canvas; `toText()` and `toSVG()` produce the other formats from the same grid.

The UI is three files: `components/home.tsx` (drop zone), `components/editor.tsx` (everything else), `components/ui.tsx` (buttons, chips, sliders). Styles come from `app/globals.css`: warm near-black, amber accent, Geist Sans and Geist Mono.

## Adding a style

Add one object to `PRESETS` in `lib/presets.ts`. A preset is a partial `Settings` bag; everything not set falls back to `DEFAULTS`.
