interface Stat {
  value: string
  label: string
}

const STATS: Stat[] = [
  { value: '12,400+', label: 'Stations created' },
  { value: '89,000+', label: 'Hours broadcast' },
  { value: '2.1M+', label: 'Minutes listened' },
]

export default function StatsBar() {
  return (
    <section className="grid grid-cols-3 gap-px bg-white/5 border-y border-border-subtle">
      {STATS.map((stat) => (
        <div key={stat.label} className="py-10 px-10 text-center bg-dark">
          <div className="text-4xl font-medium -tracking-wide mb-1.5 text-text-primary">
            {stat.value}
          </div>
          <div className="text-xs tracking-[2px] uppercase text-text-faint">
            {stat.label}
          </div>
        </div>
      ))}
    </section>
  )
}
