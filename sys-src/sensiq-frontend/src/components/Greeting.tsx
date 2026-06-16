import { useEffect, useState } from 'react'
import logo from "../assets/sensiq_logo.png"

interface GreetingProps {
  deviceId: string
  timestamp?: string // optional timestamp for freshness check, future use
}

/** Returns a greeting label and matching emoji based on the current hour of the day. */
function getGreeting(): { label: string; emoji: string } {
  const h = new Date().getHours()
  if (h < 5)  return { label: 'Good Night',      emoji: '🌙' }
  if (h < 12) return { label: 'Good Morning',    emoji: '☀️' }
  if (h < 17) return { label: 'Good Afternoon',  emoji: '🌤' }
  return       { label: 'Good Evening',          emoji: '🌆' }
}

/** Returns true if the timestamp is less than 5 minutes old (used as the "online" check). */
function isWithinFiveMinutes(timestamp: string): boolean {
  const given = new Date(timestamp).getTime();
  const now = Date.now();
  const diffMs = now - given;
  return diffMs < 5 * 60 * 1000;
}

/** Header banner showing a time-based greeting, a live clock, and the device's online status. */
export default function Greeting({ deviceId, timestamp }: GreetingProps) {
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

  const isOnline = timestamp ? isWithinFiveMinutes(timestamp) : false

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-1.5" style={{color: "#2abe9bff"}}>
          {emoji}&ensp;{label}
        </p>
        <p className="mt-1.5 text-sm text-slate-500">{dateStr}</p>
      </div>
      <div className='flex gap-2 horizontal-and-vertical-center text-center items-center'>
        <div className='h-20'>
          <img src={logo} alt="sensiq" className='h-full'/>
        </div>
        <label className="font-display text-5xl font-bold tracking-tight text-slate-50">
          Sensiq
        </label>
      </div>

      <div className="text-right">
        <p
          aria-label="Current time"
          className="font-mono text-4xl font-bold tabular-nums text-slate-200"
        >
          {timeStr}
        </p>
      <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        isOnline
          ? "border-emerald-800/60 bg-emerald-950/60"
          : "border-red-800/60 bg-red-950/60 text-red-400"
      }`}
      style={isOnline?{color:"#2abe9bff"}:{}}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
          isOnline ? "animate-pulse bg-emerald-400" : "bg-red-500"
        }`} />
        {deviceId}
      </span>
      </div>
    </div>
  )
}
