import {
  buildLuminanceArray,
  buildContrastMap,
  buildEdgeMap,
  buildStats,
  type AnalysisStats,
} from "../lib/imageProcessing"

export interface AnalyzeRequest {
  type: "analyze"
  requestId: number
  buffer: ArrayBuffer
  width: number
  height: number
  radius: number
}

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
  luminanceBuffer: ArrayBufferLike
  contrastBuffer: ArrayBufferLike
  edgeBuffer: ArrayBufferLike
  stats: AnalysisStats
  width: number
  height: number
}

export interface ErrorMessage {
  type: "error"
  requestId: number
  message: string
}

export type WorkerOutMessage = ProgressMessage | AnalyzeResult | ErrorMessage

const TOTAL_STEPS = 4

function progress(requestId: number, step: string, done: number) {
  self.postMessage({
    type: "progress",
    requestId,
    step,
    done,
    total: TOTAL_STEPS,
  } satisfies ProgressMessage)
}

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { requestId, buffer, width, height, radius } = e.data

  try {
    const data = new Uint8ClampedArray(buffer)

    progress(requestId, "Computing luminance…", 1)
    const luminance = buildLuminanceArray(data, width, height)

    progress(requestId, "Building contrast map…", 2)
    const contrast = buildContrastMap(luminance, width, height, radius)

    progress(requestId, "Building edge map…", 3)
    const edge = buildEdgeMap(luminance, width, height)

    progress(requestId, "Calculating statistics…", 4)
    const stats = buildStats(contrast)

    const result: AnalyzeResult = {
      type: "result",
      requestId,
      luminanceBuffer: luminance.buffer,
      contrastBuffer: contrast.buffer,
      edgeBuffer: edge.buffer,
      stats,
      width,
      height,
    }

    self.postMessage(result, {
      transfer: [
        luminance.buffer as ArrayBuffer,
        contrast.buffer as ArrayBuffer,
        edge.buffer as ArrayBuffer,
      ],
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err)
    self.postMessage({ type: "error", requestId, message } satisfies ErrorMessage)
  }
}
