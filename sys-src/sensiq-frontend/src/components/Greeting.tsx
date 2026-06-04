import { useEffect, useState } from 'react'

interface GreetingProps {
  deviceId: string
}

function getGreeting(): { label: string; emoji: string } {
  const h = new Date().getHours()
  if (h < 5)  return { label: 'Good Night',      emoji: '🌙' }
  if (h < 12) return { label: 'Good Morning',    emoji: '☀️' }
  if (h < 17) return { label: 'Good Afternoon',  emoji: '🌤' }
  return       { label: 'Good Evening',          emoji: '🌆' }
}

export default function Greeting({ deviceId }: GreetingProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { label, emoji } = getGreeting()

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const timeStr = now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400 mb-1.5">
          {emoji}&ensp;{label}
        </p>
        <label className="font-display text-5xl font-bold tracking-tight text-slate-50">
          Sensiq
        </label>
        <p className="mt-1.5 text-sm text-slate-500">{dateStr}</p>
      </div>

      <div className="text-right">
        <p
          aria-label="Current time"
          className="font-mono text-4xl font-bold tabular-nums text-slate-200"
        >
          {timeStr}
        </p>
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/60 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {deviceId}
        </span>
      </div>
    </div>
  )
}
