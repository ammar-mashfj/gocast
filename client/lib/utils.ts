import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge only knows Tailwind's default scale. Without these, a
 * dashboard type token like `text-display` reads as an unknown `text-*`
 * colour, and merging it with `text-foreground` silently drops one of the
 * two. Keep in step with the @theme block in app/dashboard.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "hero", "page", "display", "title-lg", "title", "title-sm", "heading",
        "lead", "body", "body-sm", "caption", "micro",
        "meter-sm", "meter", "meter-lg", "meter-xl",
      ],
      spacing: ["gutter"],
      shadow: ["panel"],
      container: ["page"],
      radius: ["hero", "card", "panel", "well", "button-xl", "button", "control", "item", "chip", "segment", "tag", "swatch"],
    },
    classGroups: {
      // `eyebrow` sets the font size, so it competes with text-* sizes.
      "font-size": ["eyebrow", "eyebrow-sm"],
      // Without this `border-stroke` reads as a border colour and merging it
      // with `border-line` drops one of them.
      "border-w": ["border-stroke"],
      "bg-image": ["grille", "grille-live"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
