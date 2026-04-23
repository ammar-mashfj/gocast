import type { MetadataRoute } from "next"
import { env } from "@/lib/env"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/station/", "/roadmap"],
        disallow: [
          "/dashboard/",
          "/auth/",
          "/api/",
          // Sentry tunnel — error reporting endpoint, not a page
          "/monitoring",
        ],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  }
}
