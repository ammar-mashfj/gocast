"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { openMic, rememberMicDevice, savedMicDeviceId } from "@/lib/mic"

export type MicPreviewState = "idle" | "opening" | "on" | "blocked" | "none"

/**
 * Pre-flight's mic check: the microphone the show will use, opened early so
 * the host can hear-check it and pick another, before anything goes out.
 *
 * Opened on request — or straight away when the browser has already granted
 * the mic, since then there is no prompt to spring on anyone. The choice is
 * remembered (lib/mic.ts) and the go-live checks open the same device, so
 * `release()` must be called before they run: two holders of one mic is the
 * kind of thing some browsers refuse.
 */
export function useMicPreview(enabled: boolean) {
  const [state, setState] = useState<MicPreviewState>("idle")
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  /**
   * Which open() is current. release() and a newer open() bump it, so an
   * open() that was still waiting on getUserMedia when either happened
   * finds itself superseded on resume and lets its stream go instead of
   * installing it. Without this, Go live pressed while the prompt was up
   * released nothing, and the preview's mic came back to sit alongside the
   * checks' own — two holders of one device.
   */
  const generation = useRef(0)

  const release = useCallback(() => {
    generation.current += 1
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
    setState((s) => (s === "on" || s === "opening" ? "idle" : s))
  }, [])

  const open = useCallback(async (deviceId?: string) => {
    const mine = ++generation.current
    const superseded = () => mine !== generation.current
    setState("opening")
    streamRef.current?.getTracks().forEach((t) => t.stop())
    try {
      let next: MediaStream
      try {
        next = await openMic(deviceId ?? savedMicDeviceId())
      } catch (err) {
        // A remembered device that's gone (unplugged): fall back to the default.
        if (!deviceId && err instanceof DOMException && err.name !== "NotAllowedError") next = await openMic()
        else throw err
      }
      if (superseded()) {
        next.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = next
      setStream(next)
      setState("on")
      const used = next.getAudioTracks()[0]?.getSettings().deviceId
      if (deviceId && used) rememberMicDevice(used)
      // Names only exist once the page holds permission, which it now does.
      const all = await navigator.mediaDevices.enumerateDevices()
      if (superseded()) return
      setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "communications"))
    } catch (err) {
      // Released while the prompt was up: release() already said `idle`.
      if (superseded()) return
      const name = err instanceof DOMException ? err.name : ""
      setState(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "none")
    }
  }, [])

  // Already allowed: open without a prompt. Otherwise wait for the button.
  useEffect(() => {
    if (!enabled) {
      release()
      return
    }
    let cancelled = false
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (!cancelled && p.state === "granted") void open()
        if (!cancelled && p.state === "denied") setState("blocked")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled, open, release])

  useEffect(() => () => {
    generation.current += 1
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  const current = stream?.getAudioTracks()[0]?.getSettings().deviceId ?? ""

  return { state, stream, devices, current, open, choose: (id: string) => open(id), release }
}
