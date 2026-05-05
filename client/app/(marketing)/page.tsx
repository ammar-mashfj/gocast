import type { Metadata } from "next";
import { cookies } from "next/headers";
import HeroSection from "@/components/homepage/heroSection/HeroSection";
import HowItWorks from "@/components/homepage/HowItWorks";
import FeaturesSection from "@/components/homepage/FeaturesSection";
import LiveNow from "@/components/homepage/LiveNow";
import ListenerLibrary from "@/components/homepage/ListenerLibrary";
import PricingSection from "@/components/homepage/PricingSection";
import CtaSection from "@/components/homepage/CtaSection";

// Pin the homepage canonical explicitly so it survives any trailing-slash
// or query-string variant that scrapers or analytics URL builders invent.
// Title + description + OG come from the root layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const cookieStore = await cookies();
  const isAuthed = !!cookieStore.get("token")?.value;

  return (
    <>
      <HeroSection isAuthed={isAuthed} />
      <HowItWorks />
      <FeaturesSection />
      <ListenerLibrary />
      <LiveNow />
      <PricingSection />
      <CtaSection isAuthed={isAuthed} />
    </>
  );
}
