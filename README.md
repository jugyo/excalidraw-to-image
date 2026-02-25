# excalidraw-to-image

Convert Excalidraw files to PNG/SVG.

## Installation

### Run once with npx

```bash
npx excalidraw-to-image --in ./diagram.excalidraw --out ./diagram.png
```

### Install globally

```bash
npm install -g excalidraw-to-image
```

After installation:

```bash
excalidraw-to-image --in ./diagram.excalidraw --out ./diagram.png
```

## CLI Usage

```bash
excalidraw-to-image --in <input.json> --out <output.(png|svg)> [--padding 24] [--scale 1]
```

### Required options

- `--in <path>`: Input Excalidraw JSON file path.
- `--out <path>`: Output image file path.
  - Use `.svg` to export SVG.
  - Use `.png` to export PNG.

### Optional options

- `--padding <number>`: Canvas padding in pixels. Default: `24`.
- `--scale <number>`: Output scale multiplier. Default: `1`.
- `--help`, `-h`: Show help.

## Examples

### Export as PNG

```bash
excalidraw-to-image \
  --in ./diagram.excalidraw \
  --out ./out/diagram.png
```

### Export as SVG

```bash
excalidraw-to-image \
  --in ./diagram.excalidraw \
  --out ./out/diagram.svg
```

### Increase resolution

```bash
excalidraw-to-image \
  --in ./diagram.excalidraw \
  --out ./out/diagram@2x.png \
  --scale 2
```

### Add extra margin

```bash
excalidraw-to-image \
  --in ./diagram.excalidraw \
  --out ./out/diagram.svg \
  --padding 64
```

## Notes

- `--out` must end with `.png` or `.svg`.
- Invalid or missing input JSON returns a non-zero exit code.
- The command prints `Generated <path>` on success.

## Local Development

```bash
bun install
bun run excalidraw:cli --help
```

Run tests:

```bash
bun test
```
