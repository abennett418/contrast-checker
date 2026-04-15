import {
  buildLuminanceArray,
  buildContrastMap,
  buildEdgeMap,
  buildStats,
  type AnalysisStats,
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

export type WorkerInMessage = AnalyzeFromBitmapRequest | AnalyzeRequest

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
  edgeBuffer: ArrayBufferLike
  stats: AnalysisStats
  width: number
  height: number
  origWidth: number
  origHeight: number
  wasDownscaled: boolean
}

export interface ErrorMessage {
  type: "error"
  requestId: number
  message: string
}

export type WorkerOutMessage = ProgressMessage | AnalyzeResult | ErrorMessage

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

  const result: AnalyzeResult = {
    type: "result",
    requestId,
    originalBuffer,
    luminanceBuffer: luminance.buffer,
    contrastBuffer: contrast.buffer,
    edgeBuffer: edge.buffer,
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
      luminance.buffer as ArrayBuffer,
      contrast.buffer as ArrayBuffer,
      edge.buffer as ArrayBuffer,
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

  // No originalBuffer — caller already has it cached
  const result: AnalyzeResult = {
    type: "result",
    requestId,
    luminanceBuffer: luminance.buffer,
    contrastBuffer: contrast.buffer,
    edgeBuffer: edge.buffer,
    stats,
    width,
    height,
    origWidth: width,
    origHeight: height,
    wasDownscaled: false,
  }

  self.postMessage(result, {
    transfer: [
      luminance.buffer as ArrayBuffer,
      contrast.buffer as ArrayBuffer,
      edge.buffer as ArrayBuffer,
    ],
  })
}

// ---------------------------------------------------------------------------
// Message entry point
// ---------------------------------------------------------------------------

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data
  try {
    if (msg.type === "analyzeFromBitmap") {
      await handleFromBitmap(msg)
    } else {
      handleFromBuffer(msg)
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
