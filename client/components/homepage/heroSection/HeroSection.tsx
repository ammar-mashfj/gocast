import styles from './heroSection.module.css';
import { HeroPlayerMock } from './HeroPlayerMock';
import { TrustCues } from '@/components/common/TrustCues';

interface HeroSectionProps {
  isAuthed?: boolean
}

export default function HeroSection({ isAuthed = false }: HeroSectionProps) {
  return (
    <div className={styles.heroSection}>
      <section className="relative grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center min-h-0 md:min-h-[540px] px-4 md:px-10 pt-12 md:pt-20 pb-12 md:pb-24 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 w-[350px] md:w-[700px] h-[350px] md:h-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.08)_0%,transparent_65%)] pointer-events-none" />

        {/* Left: copy */}
        <div className="relative z-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] px-3.5 py-1.5 rounded-full text-xs text-text-muted tracking-wide mb-7">
            <div className={`w-1.5 h-1.5 bg-emerald-live rounded-full ${styles.liveDot}`} />
            Stations are live right now
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tighter leading-tight mb-5">
            Your voice.
            <br />
            On air in
            <br />
            <em className="not-italic bg-gradient-to-br from-violet-full via-purple-400 to-pink-500 bg-clip-text text-transparent hero-glow-text">
              60 seconds.
            </em>
          </h1>

          <p className="text-sm md:text-[17px] text-text-muted leading-relaxed mb-9 max-w-[400px] mx-auto md:mx-0">
            {isAuthed
              ? "Welcome back. Open your dashboard to manage stations or hit the studio and go live."
              : "Sign up, hit go live. Listeners tune in from one shareable link — no app, no listener account."}
          </p>

          <div className="flex items-center justify-center md:justify-start gap-4">
            <a
              href={isAuthed ? "/dashboard/stations" : "/auth/register"}
              className="group bg-violet-full text-white px-6 md:px-8 py-3 md:py-3.5 rounded-lg text-sm md:text-base font-medium no-underline cursor-pointer shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(139,92,246,0.4)] transition-all"
            >
              {isAuthed ? "Open dashboard" : "Start broadcasting free"}
            </a>
          </div>

          {!isAuthed && (
            <TrustCues className="mt-6 md:justify-start" />
          )}
        </div>

        {/* Right: concrete player mock — what the visitor's audience will
            actually see. Gives hero viewers a tangible "here's the product"
            instead of decorative motion. Hidden on mobile to preserve
            above-the-fold copy density. */}
        <div className="hidden md:flex relative z-2 justify-center items-center">
          <HeroPlayerMock />
        </div>
      </section>
    </div>
  )
}
