import { useEffect, useRef, useState } from "react"
import type { AnalysisStats } from "@/lib/imageProcessing"
import type {
  AnalyzeRequest,
  WorkerOutMessage,
} from "@/workers/imageAnalysis.worker"
import AnalysisWorker from "@/workers/imageAnalysis.worker?worker"

export type AnalysisStatus = "idle" | "processing" | "done" | "error"

export interface AnalysisState {
  status: AnalysisStatus
  step: string | null
  stepDone: number
  stepTotal: number
  luminance: Float32Array | null
  contrast: Float32Array | null
  edge: Float32Array | null
  stats: AnalysisStats | null
  originalData: Uint8ClampedArray | null
  width: number
  height: number
  error: string | null
}

const DEBOUNCE_MS = 300

const IDLE_STATE: AnalysisState = {
  status: "idle",
  step: null,
  stepDone: 0,
  stepTotal: 4,
  luminance: null,
  contrast: null,
  edge: null,
  stats: null,
  originalData: null,
  width: 0,
  height: 0,
  error: null,
}

export function useImageAnalysis(
  image: HTMLImageElement | null,
  radius: number,
): AnalysisState {
  const [state, setState] = useState<AnalysisState>(IDLE_STATE)

  const workerRef = useRef<Worker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  // Create worker once; set a single persistent onmessage handler.
  useEffect(() => {
    const worker = new AnalysisWorker()
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data
      // Discard results from stale (superseded) requests.
      if (msg.requestId !== requestIdRef.current) return

      switch (msg.type) {
        case "progress":
          setState((prev) => ({
            ...prev,
            step: msg.step,
            stepDone: msg.done,
            stepTotal: msg.total,
          }))
          break

        case "result":
          setState((prev) => ({
            ...prev,
            status: "done",
            step: null,
            stepDone: prev.stepTotal,
            luminance: new Float32Array(msg.luminanceBuffer),
            contrast: new Float32Array(msg.contrastBuffer),
            edge: new Float32Array(msg.edgeBuffer),
            stats: msg.stats,
            width: msg.width,
            height: msg.height,
          }))
          break

        case "error":
          setState((prev) => ({
            ...prev,
            status: "error",
            step: null,
            error: msg.message,
          }))
          break
      }
    }

    // Catches worker-level errors that escape onmessage (e.g. syntax errors)
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault()
      setState((prev) => ({
        ...prev,
        status: "error",
        step: null,
        error: e.message || "Worker encountered an unknown error",
      }))
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!image) {
      setState(IDLE_STATE)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      const worker = workerRef.current
      if (!worker) return

      // Increment request ID so any in-flight result from a prior run is ignored.
      const requestId = ++requestIdRef.current

      try {
        const w = image.naturalWidth
        const h = image.naturalHeight

        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null

        if (typeof OffscreenCanvas !== "undefined") {
          const canvas = new OffscreenCanvas(w, h)
          ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null
        } else {
          const canvas = document.createElement("canvas")
          canvas.width = w
          canvas.height = h
          ctx = canvas.getContext("2d")
        }

        if (!ctx) throw new Error("Could not acquire 2D canvas context")

        ctx.drawImage(image, 0, 0)
        const imageData = ctx.getImageData(0, 0, w, h)
        const originalData = imageData.data

        setState((prev) => ({
          ...prev,
          status: "processing",
          step: "Extracting image data…",
          stepDone: 0,
          stepTotal: 4,
          error: null,
          originalData,
          width: w,
          height: h,
        }))

        // Transfer a copy of the buffer to the worker (transferred, not copied again)
        const buffer = originalData.buffer.slice(0) as ArrayBuffer

        const request: AnalyzeRequest = {
          type: "analyze",
          requestId,
          buffer,
          width: w,
          height: h,
          radius,
        }
        worker.postMessage(request, [buffer])
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          step: null,
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [image, radius])

  return state
}

