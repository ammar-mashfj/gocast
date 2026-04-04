interface CtaSectionProps {
  onOpenRegister: () => void
}

export default function CtaSection({ onOpenRegister }: CtaSectionProps) {
  return (
    <section className="text-center py-24 px-10 relative">
      <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.06)_0%,transparent_65%)] pointer-events-none" />
      <h2 className="text-5xl font-semibold -tracking-[1.5px] mb-4 relative z-1">
        Ready to go on air?
      </h2>
      <p className="text-base text-text-muted/85 mb-9 relative z-1 max-w-[400px] mx-auto">
        Create your station in under a minute. Free forever.
      </p>
      <button
        onClick={onOpenRegister}
        className="relative z-1 inline-block bg-violet text-white px-10 py-4 rounded-lg text-base font-medium border-none cursor-pointer hover:bg-violet-full hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(139,92,246,0.3)] transition-all"
      >
        Create your station
      </button>
    </section>
  )
}
