import {
  buildLuminanceArray,
  buildContrastMap,
  buildEdgeMap,
  buildStats,
  renderVisualization,
  type AnalysisStats,
  type VisualizationMode,
} from "../lib/imageProcessing"

// ---------------------------------------------------------------------------
// Inbound message types
// ---------------------------------------------------------------------------

/** New image: bitmap transferred from main thread, worker extracts pixel data. */
export interface AnalyzeFromBitmapRequest {
  type: "analyzeFromBitmap"
  requestId: number
  bitmap: ImageBitmap
  width: number      // target (possibly scaled) dimensions
  height: number
  origWidth: number  // original image dimensions before downscale
  origHeight: number
  radius: number
}

/** Radius-only re-analysis: main thread re-sends cached pixel buffer. */
export interface AnalyzeRequest {
  type: "analyze"
  requestId: number
  buffer: ArrayBuffer
  width: number
  height: number
  radius: number
}

/** Render-only request: uses arrays cached from last analysis. */
export interface RenderRequest {
  type: "render"
  requestId: number
  mode: VisualizationMode
}

export type WorkerInMessage = AnalyzeFromBitmapRequest | AnalyzeRequest | RenderRequest

// ---------------------------------------------------------------------------
// Outbound message types
// ---------------------------------------------------------------------------

export interface ProgressMessage {
  type: "progress"
  requestId: number
  step: string
  done: number
  total: number
}

export interface AnalyzeResult {
  type: "result"
  requestId: number
  /** Present when a new image was processed; absent on radius-only reanalysis. */
  originalBuffer?: ArrayBufferLike
  luminanceBuffer: ArrayBufferLike
  contrastBuffer: ArrayBufferLike
  stats: AnalysisStats
  width: number
  height: number
  origWidth: number
  origHeight: number
  wasDownscaled: boolean
}

export interface RenderResult {
  type: "renderResult"
  requestId: number
  imageBuffer: ArrayBuffer
  width: number
  height: number
}

export interface ErrorMessage {
  type: "error"
  requestId: number
  message: string
}

export type WorkerOutMessage = ProgressMessage | AnalyzeResult | RenderResult | ErrorMessage

// ---------------------------------------------------------------------------
// Module-level render cache (retained after each analysis for render requests)
// ---------------------------------------------------------------------------

let renderCache: {
  luminance: Float32Array
  contrast: Float32Array
  edge: Float32Array
  original: Uint8ClampedArray
  width: number
  height: number
} | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postProgress(requestId: number, step: string, done: number, total: number) {
  self.postMessage({
    type: "progress",
    requestId,
    step,
    done,
    total,
  } satisfies ProgressMessage)
}

// ---------------------------------------------------------------------------
// Analysis paths
// ---------------------------------------------------------------------------

async function handleFromBitmap(msg: AnalyzeFromBitmapRequest) {
  const { requestId, bitmap, width, height, origWidth, origHeight, radius } = msg
  const TOTAL = 5

  postProgress(requestId, "Extracting pixel data…", 1, TOTAL)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not acquire OffscreenCanvas context")
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  // Copy now so we can both process and transfer the original back
  const originalBuffer = data.buffer.slice(0) as ArrayBuffer

  postProgress(requestId, "Computing luminance…", 2, TOTAL)
  const luminance = buildLuminanceArray(data, width, height)

  postProgress(requestId, "Building contrast map…", 3, TOTAL)
  const contrast = buildContrastMap(luminance, width, height, radius)

  postProgress(requestId, "Building edge map…", 4, TOTAL)
  const edge = buildEdgeMap(luminance, width, height)

  postProgress(requestId, "Calculating statistics…", 5, TOTAL)
  const stats = buildStats(contrast)

  // Cache arrays so render requests can use them without re-analysis.
  // Use a separate copy — originalBuffer is transferred to the main thread which
  // would detach the ArrayBuffer and make the Uint8ClampedArray view read zeros.
  renderCache = { luminance, contrast, edge, original: new Uint8ClampedArray(originalBuffer.slice(0)), width, height }

  // Transfer originalBuffer and clone luminance/contrast to main thread.
  // edge stays worker-only (only needed for rendering).
  const result: AnalyzeResult = {
    type: "result",
    requestId,
    originalBuffer,
    luminanceBuffer: luminance.buffer.slice(0),
    contrastBuffer: contrast.buffer.slice(0),
    stats,
    width,
    height,
    origWidth,
    origHeight,
    wasDownscaled: width !== origWidth || height !== origHeight,
  }

  self.postMessage(result, {
    transfer: [
      originalBuffer,
      result.luminanceBuffer as ArrayBuffer,
      result.contrastBuffer as ArrayBuffer,
    ],
  })
}

function handleFromBuffer(msg: AnalyzeRequest) {
  const { requestId, buffer, width, height, radius } = msg
  const TOTAL = 4
  const data = new Uint8ClampedArray(buffer)

  postProgress(requestId, "Computing luminance…", 1, TOTAL)
  const luminance = buildLuminanceArray(data, width, height)

  postProgress(requestId, "Building contrast map…", 2, TOTAL)
  const contrast = buildContrastMap(luminance, width, height, radius)

  postProgress(requestId, "Building edge map…", 3, TOTAL)
  const edge = buildEdgeMap(luminance, width, height)

  postProgress(requestId, "Calculating statistics…", 4, TOTAL)
  const stats = buildStats(contrast)

  // Update cache — reuse existing original from previous cache (radius change doesn't replace image).
  if (renderCache) {
    renderCache = { ...renderCache, luminance, contrast, edge }
  }

  // No originalBuffer — caller already has it cached
  const result: AnalyzeResult = {
    type: "result",
    requestId,
    luminanceBuffer: luminance.buffer.slice(0),
    contrastBuffer: contrast.buffer.slice(0),
    stats,
    width,
    height,
    origWidth: width,
    origHeight: height,
    wasDownscaled: false,
  }

  self.postMessage(result, {
    transfer: [
      result.luminanceBuffer as ArrayBuffer,
      result.contrastBuffer as ArrayBuffer,
    ],
  })
}

// ---------------------------------------------------------------------------
// Render handler
// ---------------------------------------------------------------------------

function handleRender(msg: RenderRequest) {
  if (!renderCache) return

  const { luminance, contrast, edge, original, width, height } = renderCache
  const imageData = renderVisualization(msg.mode, luminance, contrast, edge, original, width, height)
  const buffer = imageData.data.buffer.slice(0) as ArrayBuffer

  self.postMessage(
    { type: "renderResult", requestId: msg.requestId, imageBuffer: buffer, width, height } satisfies RenderResult,
    { transfer: [buffer] },
  )
}

// ---------------------------------------------------------------------------
// Message entry point
// ---------------------------------------------------------------------------

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data
  try {
    if (msg.type === "analyzeFromBitmap") {
      await handleFromBitmap(msg)
    } else if (msg.type === "analyze") {
      handleFromBuffer(msg)
    } else {
      handleRender(msg)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({
      type: "error",
      requestId: msg.requestId,
      message,
    } satisfies ErrorMessage)
  }
}
