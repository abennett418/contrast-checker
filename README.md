# Contrast Checker

A browser-based WCAG contrast visualizer. Upload any image and instantly see per-pixel contrast analysis rendered as interactive overlays — no server, no data leaves your machine.

## What it does

Contrast Checker analyses every pixel in an uploaded image and produces four visualization modes based on the [WCAG 2.1 contrast ratio formula](https://www.w3.org/TR/WCAG21/#contrast-minimum):

| Mode | Description |
|------|-------------|
| **Heatmap** | Colours each pixel by its local contrast ratio — red (fail) through to green (AAA) |
| **Pass / Fail** | Binary overlay highlighting pixels that pass or fail the selected WCAG threshold |
| **Luminance** | Greyscale map of relative luminance across the image |
| **Edge map** | Contrast ratio at exact pixel boundaries using 8-connected neighbours |

### Key features

- **Fully browser-side** — all processing runs locally via a Web Worker; no uploads, no backend
- **Hover inspection** — move your cursor over either canvas to see the exact hex colour, luminance value, contrast ratio, and WCAG tier (AAA / AA / AA Large / Fail) for that pixel
- **Adjustable radius** — tune the neighbourhood radius (1–20 px) used for local contrast calculations
- **Stats panel** — aggregated breakdown of pixel counts and percentages per WCAG tier
- **Any image format** — supports JPEG, PNG, WebP, AVIF, and anything else the browser's `<img>` tag accepts

## How contrast is calculated

Local contrast for each pixel is the ratio of the maximum luminance to the minimum luminance within a sliding window of the chosen radius, computed with the standard WCAG formula:

$$\text{contrast} = \frac{L_{max} + 0.05}{L_{min} + 0.05}$$

The sliding window uses a two-pass O(w×h) algorithm (rows then columns) to keep large radii fast.

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) (including native `?worker` Web Worker bundling)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) component library

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (or [Bun](https://bun.sh/))

### Getting started

```bash
# Install dependencies
npm install        # or: bun install

# Start the dev server
npm run dev        # or: bun run dev
```

The app will be available at `http://localhost:5173`.

### Other commands

```bash
npm run build       # Production build (outputs to dist/)
npm run preview     # Preview the production build locally
npm run typecheck   # Run TypeScript type checking
npm run lint        # Run ESLint
npm run format      # Format source files with Prettier
```

### Project structure

```
src/
├── components/         # React UI components
│   └── ui/             # shadcn/ui primitives
├── hooks/              # useImageAnalysis — worker lifecycle & state
├── lib/
│   ├── wcag.ts         # Pure WCAG math (luminance, contrast ratio, tier)
│   └── imageProcessing.ts  # Pixel-level algorithms (contrast map, edge map, stats)
└── workers/
    └── imageAnalysis.worker.ts  # Web Worker entry point
```

## Contributing

Contributions are welcome. Please open an issue first to discuss any significant changes.

## Licence

MIT
