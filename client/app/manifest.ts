import type { MetadataRoute } from "next"

/**
 * Progressive Web App manifest. Lets listeners "Add to Home Screen" on mobile
 * for one-tap launching, and qualifies the player for OS-level media controls.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoCast — Live Radio Streaming",
    short_name: "GoCast",
    description: "Broadcast live radio from your browser. Listeners tune in from one shareable link.",
    start_url: "/",
    display: "standalone",
    background_color: "#08080d",
    theme_color: "#8b5cf6",
    orientation: "portrait-primary",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  }
}
