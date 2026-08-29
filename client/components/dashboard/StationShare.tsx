"use client"

import { useRef, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { IconDownload, IconQrcode } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CopyButton } from "@/components/dashboard/CopyButton"

/**
 * Rendered size, and also the exported one. Big enough that the downloaded PNG
 * survives being dropped into a poster or a story without resampling to mush.
 */
const QR_PIXELS = 640
/** On-screen size. The canvas renders at QR_PIXELS and is scaled down by CSS. */
const QR_DISPLAY = 224

/**
 * Brand violet, two stops down from the UI's #8b5cf6.
 *
 * The lighter brand violet is the obvious choice and the wrong one: against
 * white it lands near 3.6:1, and QR decoders threshold an image to black and
 * white before they do anything else — a code that looks fine to the eye can
 * simply fail to binarise on a cheap phone camera in bad light. This is the
 * same hue at roughly 11:1, so it reads as GoCast violet and still scans off a
 * photocopy.
 */
const QR_VIOLET = "#4c1d95"

/**
 * The app icon (app/icon.svg) inlined as a data URI.
 *
 * Inlined rather than referenced by path so the canvas never waits on a network
 * fetch before it can be exported, and — more importantly — so `toDataURL()`
 * cannot be blocked: a same-origin file would be fine today, but any move to a
 * CDN would silently taint the canvas and break Download PNG. A data URI never
 * taints.
 */
const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="7" fill="${QR_VIOLET}"/><g transform="translate(6.65 5.95) scale(0.766)" fill="#ffffff"><path d="M13.104 26.136C10.536 26.136 8.268 25.584 6.3 24.48C4.332 23.352 2.784 21.816 1.656 19.872C0.552 17.904 0 15.66 0 13.14C0 10.572 0.552 8.316 1.656 6.372C2.784 4.404 4.332 2.868 6.3 1.764C8.268 0.635998 10.536 0.0719986 13.104 0.0719986C14.448 0.0719986 15.756 0.299998 17.028 0.755998C18.3 1.188 19.464 1.788 20.52 2.556C21.576 3.324 22.428 4.2 23.076 5.184L20.664 6.84C20.184 6.072 19.536 5.388 18.72 4.788C17.904 4.164 17.004 3.684 16.02 3.348C15.06 3.012 14.088 2.844 13.104 2.844C11.16 2.844 9.432 3.288 7.92 4.176C6.408 5.04 5.22 6.24 4.356 7.776C3.492 9.312 3.06 11.1 3.06 13.14C3.06 15.108 3.48 16.872 4.32 18.432C5.184 19.968 6.372 21.18 7.884 22.068C9.42 22.956 11.16 23.4 13.104 23.4C14.736 23.4 16.176 23.064 17.424 22.392C18.696 21.696 19.692 20.748 20.412 19.548C21.132 18.324 21.492 16.92 21.492 15.336L24.408 15.12C24.408 17.328 23.928 19.26 22.968 20.916C22.008 22.548 20.676 23.832 18.972 24.768C17.268 25.68 15.312 26.136 13.104 26.136ZM15.3 15.48V12.852H24.408V15.228L22.968 15.48H15.3Z"/></g></svg>`

const LOGO_URI = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`

/**
 * Logo size as a fraction of the code. Level H recovers 30% of the symbol, and
 * excavating a centred 22% square costs about 5% of the modules — comfortably
 * inside that budget, with the rest left over for the damage the recovery level
 * is actually there for.
 */
const LOGO_RATIO = 0.22
const LOGO_PIXELS = Math.round(QR_PIXELS * LOGO_RATIO)

interface StationShareProps {
  /** Public player URL — the thing both the link and the code point at. */
  url: string
  stationName: string
  slug: string
}

/**
 * The share rail: one link, and a code for the physical world.
 *
 * The QR is drawn to a canvas rather than an SVG specifically so it can be
 * exported — a code you can only screenshot is not much use on a flyer, and
 * the flyer is the whole reason a radio station wants one.
 */
export function StationShare({ url, stationName, slug }: StationShareProps) {
  const [showQr, setShowQr] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement("a")
    link.download = `${slug}-qr.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Share your station</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Anyone with this link can tune in from a browser — no app, no signup.
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <code className="text-xs text-muted-foreground truncate">{url}</code>
            <CopyButton text={url} title={stationName} />
          </div>
          <Button
            variant="outline"
            className="w-full mt-3"
            onClick={() => setShowQr(true)}
          >
            <IconQrcode data-icon="inline-start" />
            Tune-in code
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tune-in code</DialogTitle>
            <DialogDescription>
              Point a phone camera at this to open {stationName}. Put it on a poster,
              a flyer, or the end of a set.
            </DialogDescription>
          </DialogHeader>

          {/* Violet ground for the frame, white ground for the code itself. The
              code stays light-on-dark-modules in both themes: a scanner
              binarises before it decodes, and an inverted code fails outright
              on plenty of cameras. */}
          <div className="flex justify-center rounded-xl">
            <div className="rounded-lg bg-white p-3">
              <QRCodeCanvas
                ref={canvasRef}
                value={url}
                size={QR_PIXELS}
                // H (30% recovery) because the centre is punched out for the
                // logo. Q would still decode, but it spends the headroom that
                // a crease or a thumb over one corner is supposed to use.
                level="H"
                marginSize={4}
                bgColor="#ffffff"
                fgColor={QR_VIOLET}
                imageSettings={{
                  src: LOGO_URI,
                  height: LOGO_PIXELS,
                  width: LOGO_PIXELS,
                  // Clear the modules underneath rather than painting over
                  // them — a decoder that sees half a module reads noise.
                  excavate: true,
                }}
                style={{ width: QR_DISPLAY, height: QR_DISPLAY }}
              />
            </div>
          </div>

          <code className="text-xs text-muted-foreground text-center break-all">{url}</code>

          <Button onClick={download} className="w-full">
            <IconDownload data-icon="inline-start" />
            Download PNG
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
