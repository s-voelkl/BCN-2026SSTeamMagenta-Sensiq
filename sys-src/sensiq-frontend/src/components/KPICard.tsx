import Card from './Card'
import type { KPI } from '../types/dashboard'
import type { SensorDataLive } from '../types/dashboard'

interface KPICardProps {
  kpi: KPI
  data?: SensorDataLive
  loading?: boolean // live request in flight -> show a skeleton
  offline?: boolean // device reported offline -> "no data" message
  error?: boolean   // any other failure -> generic error message
}

function transformFlame(value: number): string {
  /** Transform the raw flame sensor value into a more user-friendly message. */
  if (value == 0) return 'Negative'
  else return 'Positive'
}

function transformDecimal(value: number): number {
  /** Transform a decimal value into a more readable format with units. */
  return parseFloat(value.toFixed(2)) // keep one decimal place
}

function transformInteger(value: number): number {
  return Math.trunc(value)
}

/** The measured value + unit, shown once data is available. */
function ValueDisplay({ kpi, data }: { kpi: KPI; data: SensorDataLive }) {
  let value = data[kpi.measure]
  if (typeof value === 'number' && kpi.measure !== 'dht_temperature') value = transformInteger(value)
  if (typeof value === 'number' && kpi.measure === 'dht_temperature') value = transformDecimal(value)
  const className = 'text-2xl font-semibold font-mono tracking-[0.15em] tabular-nums text-slate-50'

  return (
    <div className="mt-3 flex items-baseline justify-center gap-1.5">
      <p className={kpi.measure === 'flame_analog' ? className : 'font-mono text-5xl font-bold tabular-nums text-slate-200'}
        style={kpi.measure === 'flame_analog' ? { color: data.flame_analog === 0 ? '#2abe9bff' : '#EF4444' } : {}}>
        {kpi.measure === 'flame_analog' ? transformFlame(value) : `${value}`}
      </p>
      {kpi.unit && (
        <p className="font-mono text-3xl font-semibold text-slate-400">
          {kpi.unit}
        </p>
      )}
    </div>
  )
}

/**
 * A single dashboard tile. Shows the sensor value when data is available, or its
 * own skeleton / offline / error state so one failing live request doesn't blank
 * the whole dashboard.
 */
export default function KPICard({ kpi, data, loading = false, offline = false, error = false }: KPICardProps) {
  return (
    <Card className="h-full flex flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 horizontal-and-vertical-center">
        {kpi.label}
      </p>

      {loading ? (
        <div
          role="status"
          aria-label={`${kpi.label} loading`}
          data-testid="kpi-skeleton"
          className="mt-3 h-9 w-20 animate-pulse rounded-lg bg-slate-800"
        />
      ) : offline ? (
        <div className="mt-3 flex flex-col items-center gap-0.5 text-slate-500">
          <span className="text-sm font-semibold">No data</span>
          <span className="text-[11px]">Device offline</span>
        </div>
      ) : error || !data ? (
        <div className="mt-3 flex flex-col items-center gap-0.5 text-rose-400/80">
          <span className="text-sm font-semibold">Unavailable</span>
          <span className="text-[11px]">An error occurred</span>
        </div>
      ) : (
        <ValueDisplay kpi={kpi} data={data} />
      )}
    </Card>
  )
}
