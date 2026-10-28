import type { Metadata } from "next";
import { isAuthenticated } from "@/lib/session";
import HeroSection from "@/components/homepage/heroSection/HeroSection";
import HearOneNow from "@/components/homepage/heroSection/HearOneNow";
import HowItWorks from "@/components/homepage/HowItWorks";
import StudioSection from "@/components/homepage/StudioSection";
import ProgrammeSection from "@/components/homepage/ProgrammeSection";
import ListenerLibrary from "@/components/homepage/ListenerLibrary";
import PricingSection from "@/components/homepage/PricingSection";
import CtaSection from "@/components/homepage/CtaSection";

// Pin the homepage canonical explicitly so it survives any trailing-slash
// or query-string variant that scrapers or analytics URL builders invent.
// Title + description + OG come from the root layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * See the handover, hear it, see the desk, see the week, pay nothing. Each section after the
 * hero shows one screen of the product doing the thing the copy claims;
 * the Pro extras sit inside the AutoDJ section rather than as a checklist
 * of their own, and pricing closes the argument.
 */
export default async function Home() {
  const isAuthed = await isAuthenticated();

  return (
    <>
      <HeroSection isAuthed={isAuthed} />
      <HearOneNow />
      <HowItWorks />
      <StudioSection />
      <ProgrammeSection />
      <ListenerLibrary />
      <PricingSection isAuthed={isAuthed} />
      <CtaSection isAuthed={isAuthed} />
    </>
  );
}
