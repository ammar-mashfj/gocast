import Navbar from "@/components/homepage/navbar/Navbar"
import Footer from "@/components/homepage/Footer"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-dark text-white font-sans min-h-screen flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </div>
  )
}
