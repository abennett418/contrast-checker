# WCAG Contrast Checker Visualizer — Plan

## Overview

Browser-only tool that accepts an image upload and renders four interactive WCAG contrast visualizations. Processing runs in a Web Worker for non-blocking UI. Layout is side-by-side (original left, visualization right) with hover-synced crosshairs, a per-pixel info panel, and an aggregated stats table.

---

## Phase 1: Core WCAG library + image processing

### Step 1 — `src/lib/wcag.ts` (pure functions, no deps)
- `srgbToLinear` — gamma-decode sRGB 8-bit to linear
- `relativeLuminance(r, g, b)` — WCAG formula: `0.2126R + 0.7152G + 0.0722B`
- `contrastRatio(l1, l2)` — `(max+0.05)/(min+0.05)`
- `wcagLevel(ratio)` → `'AAA' | 'AA' | 'AA-large' | 'fail'`

### Step 2 — `src/lib/imageProcessing.ts` (algorithms run in-worker)
- `buildLuminanceArray` — per-pixel luminance Float32Array
- `buildContrastMap(luminance, w, h, radius)` — 2-pass sliding-window min/max (rows then cols) → O(w×h), contrast ratio of windowMax vs windowMin
- `buildEdgeMap` — for each pixel, max contrast ratio against 8 immediate neighbours
- `buildStats` — counts/percentages per tier
- Colour-mapping functions: `ratioToHeatmapRGBA`, `ratioToPassFailRGBA`, `luminanceToGrey`

### Step 3 — `src/workers/imageAnalysis.worker.ts`
- Accepts `{ buffer, width, height, radius }` (transferable)
- Posts back `{ luminance, contrast, edge, stats }` as transferable ArrayBuffers
- Vite native worker import via `?worker` suffix

---

## Phase 2: shadcn/ui components

### Step 4 — Install shadcn components
```
npx shadcn add card badge table separator toggle-group slider
```

---

## Phase 3: React components

### Step 5 — `src/components/ImageUploader.tsx`
Drag-and-drop + click-to-browse, thumbnail preview, `onImageLoaded` callback.

### Step 6 — `src/hooks/useImageAnalysis.ts`
Manages worker lifecycle, extracts ImageData via offscreen canvas, re-runs on image/radius change (debounced 300ms).
Returns `{ status, luminance, contrast, edge, stats, width, height, originalData }`.

### Step 7 — `src/components/CanvasViewer.tsx`
Renders an `ImageData` to canvas, fires `onHover(x,y)`, draws crosshair at `externalHover` position.

### Step 8 — `src/components/VisualizationControls.tsx`
`ToggleGroup` for 4 modes, `Slider` for radius (1–20), colour legend swatches.

### Step 9 — `src/components/HoverInfoPanel.tsx`
Colour swatch + hex, luminance (3dp), contrast ratio, WCAG Badge tags (AAA / AA / AA large / Fail).

### Step 10 — `src/components/StatsPanel.tsx`
`Table` with tier/ratio/count/% rows, stacked progress bar in Tailwind.

### Step 11 — `src/App.tsx`
Assembles everything: `useImageAnalysis` hook, shared `hoverPixel` state for crosshair sync, mode/radius state.

---

## Visualization colour map

| Tier     | Ratio    | Heatmap colour  | Pass/Fail tint     |
|----------|----------|-----------------|--------------------|
| Fail     | < 3:1    | Red `#ef4444`   | Red overlay 40%    |
| AA large | 3–4.5:1  | Orange `#f97316`| Orange tint 30%    |
| AA       | 4.5–7:1  | Yellow-green `#84cc16` | Green tint 30% |
| AAA      | ≥ 7:1    | Green `#22c55e` | Green tint 50%     |

- **Luminance map**: linear greyscale (0 → black, 1 → white)
- **Edge map**: same heatmap colours showing inter-pixel contrast at exact boundaries

---

## Decisions

- 100% browser-side, no backend
- WCAG 2.1 (not WCAG 3/APCA) — currently most widely required standard
- "Local contrast" = contrast ratio of max vs min luminance within a radius-R neighbourhood
- Edge map = 8-connected neighbour contrast at exact pixel boundaries
- No third-party charting lib — raw `ImageData` API for processing, Tailwind for stats bar
- Supports any format the browser `<img>` tag accepts (JPEG, PNG, WebP, AVIF)
- Vite `?worker` import for Web Worker bundling

---

## Verification

1. `bun run dev` — page loads, image uploader visible
2. Upload black-on-white PNG → luminance map shows sharp edges, heatmap shows green at text
3. Upload low-contrast grey-on-grey → heatmap shows red/orange
4. Hover pixels → HoverInfoPanel updates with hex, luminance, ratio, WCAG badges
5. Adjust radius slider → visualization re-runs
6. `bun run typecheck` — zero errors
7. `bun run build` — production build succeeds
