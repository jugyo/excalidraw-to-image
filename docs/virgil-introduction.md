# Virgil font introduction

This project uses `Virgil` for hand-drawn text rendering.

## Bundled files

- `fonts/virgil/Virgil.ttf`
- `fonts/virgil/Virgil.woff2`
- `fonts/virgil/OFL-1.1.txt`
- `fonts/virgil/UPSTREAM-LICENSE-REFERENCE.md`
- `THIRD_PARTY_LICENSES.md`

## Conversion workflow

Generate `fonts/virgil/Virgil.ttf` from `fonts/virgil/Virgil.woff2`:

```bash
scripts/convert-virgil-woff2-to-ttf.sh
```

## Rendering behavior

- SVG: emits `font-family="Virgil, Noto Sans JP, sans-serif"` and embeds `fonts/virgil/Virgil.ttf` as `@font-face`.
- PNG: `@resvg/resvg-js` uses `fonts/virgil/Virgil.ttf` via `fontFiles`.

## SVG output behavior

The default text font fallback order is:

`Virgil, Noto Sans JP, sans-serif`

## License disclosure

Print bundled third-party licenses from CLI:

```bash
bun run src/cli/excalidraw-to-svg.ts --print-licenses
bun run src/cli/excalidraw-to-png.ts --print-licenses
```
