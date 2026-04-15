import Navbar from "@/components/homepage/navbar/Navbar";
import HeroSection from "@/components/homepage/heroSection/HeroSection";
import HowItWorks from "@/components/homepage/HowItWorks";
import FeaturesSection from "@/components/homepage/FeaturesSection";
import LiveNow from "@/components/homepage/LiveNow";
import PricingSection from "@/components/homepage/PricingSection";
import CtaSection from "@/components/homepage/CtaSection";
import Footer from "@/components/homepage/Footer";

export default function Home() {
  return (
    <div className="bg-dark text-white font-sans min-h-screen">
      <div className="max-w-[1200px] mx-auto">
        <Navbar />
        <HeroSection />
        <HowItWorks />
        <FeaturesSection />
        <LiveNow />
        <PricingSection />
        <CtaSection />
        <Footer />
      </div>

      
    </div>
  );
}
