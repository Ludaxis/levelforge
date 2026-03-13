import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert a hex colour to its perceptual-luminance grayscale equivalent. */
export function toGrayscale(hexColor: string): string {
  // Handle non-hex colors
  if (!hexColor.startsWith('#')) return hexColor;

  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  // Use luminance formula for perceptually accurate grayscale
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}
