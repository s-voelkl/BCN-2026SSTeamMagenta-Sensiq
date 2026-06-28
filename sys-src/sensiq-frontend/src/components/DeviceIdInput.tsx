import { useState, type FormEvent } from 'react'

interface DeviceIdInputProps {
  currentDeviceId: string
  onSubmit: (deviceId: string) => void
}

/**
 * Input form for switching the active device at runtime.
 * Typing only updates local state — the parent is notified only on explicit confirmation,
 * so no API request is fired mid-keystroke.
 */

export default function DeviceIdInput({ currentDeviceId, onSubmit }: DeviceIdInputProps) {
  const [pending, setPending] = useState(currentDeviceId)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = pending.trim()
    if (trimmed.length > 0) {
      onSubmit(trimmed)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        placeholder="Device ID"
        aria-label="Device ID"
        className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 font-mono text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-700"
      />
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#2abe9bff' }}
        disabled={pending.trim().length === 0}
      >
        Connect
      </button>
    </form>
  )
}