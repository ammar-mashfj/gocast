import { BroadcastProvider } from "@/contexts/BroadcastContext"

export default function BroadcastLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <BroadcastProvider>{children}</BroadcastProvider>
}
