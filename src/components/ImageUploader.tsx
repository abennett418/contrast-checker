import { useCallback, useRef, useState } from "react"
import { Upload, ImageIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ImageUploaderProps {
  onImageLoaded: (img: HTMLImageElement) => void
}

export function ImageUploader({ onImageLoaded }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return
      const url = URL.createObjectURL(file)
      setPreview(url)
      const img = new Image()
      img.onload = () => {
        onImageLoaded(img)
      }
      img.src = url
    },
    [onImageLoaded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) loadFile(file)
    },
    [loadFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) loadFile(file)
    },
    [loadFile],
  )

  return (
    <Card
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-4 border-2 border-dashed p-10 transition-colors select-none",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/30",
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      aria-label="Upload an image to analyse contrast"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
      />

      {preview ? (
        <div className="flex flex-col items-center gap-3">
          <img
            src={preview}
            alt="Uploaded preview"
            className="max-h-36 max-w-xs rounded object-contain shadow"
          />
          <p className="text-muted-foreground text-sm">
            Click or drag to replace
          </p>
        </div>
      ) : (
        <>
          <div className="bg-muted rounded-full p-4">
            {isDragging ? (
              <ImageIcon className="text-primary size-8" />
            ) : (
              <Upload className="text-muted-foreground size-8" />
            )}
          </div>
          <div className="text-center">
            <p className="font-medium">Drop an image here</p>
            <p className="text-muted-foreground text-sm">
              or click to browse — JPEG, PNG, WebP, AVIF, GIF
            </p>
          </div>
        </>
      )}
    </Card>
  )
}
