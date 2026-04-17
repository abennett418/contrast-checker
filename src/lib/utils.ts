import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolves a path relative to the app's public folder, respecting the Vite
 * `base` config. Use this instead of bare `/file.ext` paths so that assets
 * load correctly both locally and when hosted at a sub-path (e.g. GitHub Pages).
 *
 * @example
 * publicUrl("logo.svg") // → "/contrast-checker/logo.svg" in production
 */
export function publicUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`
}
