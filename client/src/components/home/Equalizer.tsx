const BAR_CLASSES = [
  'animate-eq-1',
  'animate-eq-2',
  'animate-eq-3',
  'animate-eq-4',
  'animate-eq-5',
] as const

export default function Equalizer() {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
      {BAR_CLASSES.map((cls) => (
        <span key={cls} className={`w-0.5 rounded-sm bg-violet-muted ${cls}`} />
      ))}
    </div>
  )
}
