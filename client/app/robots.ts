import type { MetadataRoute } from "next"
import { env } from "@/lib/env"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Signed-in only: every URL here redirects a crawler to the login
          // page, so fetching them wastes crawl budget and nothing else.
          "/dashboard/",
          "/api/",
          // Sentry tunnel — error reporting endpoint, not a page
          "/monitoring",
          // Audio plumbing, not pages: HLS playlists and segments, and the
          // dev-only Icecast proxy.
          "/hls-proxy/",
          "/stream-proxy/",
        ],
        // NOT disallowed: /auth/ and /embed/. Both carry a noindex meta tag,
        // and a crawler can only obey a tag on a page it is allowed to fetch.
        // Disallowing them here would hide the noindex, and a URL Google
        // finds through links elsewhere then gets indexed anyway, bare.
      },
    ],
    // Two files: the site's own pages, which change when we deploy, and the
    // stations, which change when owners do.
    sitemap: [`${env.appUrl}/sitemap.xml`, `${env.appUrl}/station/sitemap.xml`],
  }
}
