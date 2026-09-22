import type { Metadata } from "next";
import { isAuthenticated } from "@/lib/session";
import HeroSection from "@/components/homepage/heroSection/HeroSection";
import HowItWorks from "@/components/homepage/HowItWorks";
import StudioSection from "@/components/homepage/StudioSection";
import ProgrammeSection from "@/components/homepage/ProgrammeSection";
import LiveNow from "@/components/homepage/LiveNow";
import ListenerLibrary from "@/components/homepage/ListenerLibrary";
import CapabilityStrip from "@/components/homepage/CapabilityStrip";
import PricingSection from "@/components/homepage/PricingSection";
import CtaSection from "@/components/homepage/CtaSection";

// Pin the homepage canonical explicitly so it survives any trailing-slash
// or query-string variant that scrapers or analytics URL builders invent.
// Title + description + OG come from the root layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const isAuthed = await isAuthenticated();

  return (
    <>
      <HeroSection isAuthed={isAuthed} />
      <HowItWorks />
      <StudioSection />
      <ProgrammeSection />
      <ListenerLibrary />
      <LiveNow />
      <CapabilityStrip />
      <PricingSection />
      <CtaSection isAuthed={isAuthed} />
    </>
  );
}
