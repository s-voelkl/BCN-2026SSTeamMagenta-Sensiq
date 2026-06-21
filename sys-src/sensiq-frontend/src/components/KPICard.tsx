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

function transformFlame(value: number | boolean): string {
  /** Transform the raw flame sensor value into a more user-friendly message. */
  if (value == false) return 'Negative'
  else return 'Positive'
}

function transformDecimal(value: number): number {
  /** Transform a decimal value into a more readable format with units. */
  return parseFloat(value.toFixed(2)) // keep one decimal place
}

function transformInteger(value: number): number {
  return Math.trunc(value)
}

function getValueColor(kpi: KPI, data: SensorDataLive): string {
    const value = data[kpi.measure]

    switch (kpi.measure) {

        case 'bme_temperature':
            if (typeof value !== 'number') return '#E2E8F0'

            if (value < 10.00 || value >= 35.00) return '#EF4444'
            return '#2abe9b'

        case 'bme_humidity':
            if (typeof value !== 'number') return '#E2E8F0'

            if (value < 20 || value > 80) return '#EF4444'
            return '#2abe9b'

        case 'bme_pressure':
            if (typeof value !== 'number') return '#E2E8F0'

            if (value < 900 || value > 1100) return '#EF4444'
            return '#2abe9b'

        case 'bme_voc':
            if (typeof value !== 'number') return '#E2E8F0'

            if (value > 250) return '#EF4444'
            return '#2abe9b'

        case 'tsl_lux':
            if (typeof value !== 'number') return '#E2E8F0'

            if (value > 1000) return '#EF4444'
            return '#2abe9b'

        case 'flame_digital':
            return data.flame_digital ? '#EF4444' : '#2abe9b'

        default:
            return '#E2E8F0'
    }
}

/** The measured value + unit, shown once data is available. */
function ValueDisplay({ kpi, data }: { kpi: KPI; data: SensorDataLive }) {
  let value = data[kpi.measure]
  if (typeof value === 'number' && kpi.measure !== 'bme_temperature') value = transformInteger(value)
  if (typeof value === 'number' && kpi.measure === 'bme_temperature') value = transformDecimal(value)
  const className = 'text-2xl font-semibold font-mono tracking-[0.15em] tabular-nums text-slate-50'
    const valueColor = getValueColor(kpi, data)

  return (
    <div className="mt-3 flex items-baseline justify-center gap-1.5">
      <p className={kpi.measure === 'flame_digital' ? className : 'font-mono text-4xl sm:text-5xl font-bold tabular-nums text-slate-200'}
         style={{
             color: valueColor,
         }}>
        {kpi.measure === 'flame_digital' ? transformFlame(value) : `${value}`}
      </p>
      {kpi.unit && (
        <p className="font-mono text-2xl sm:text-3xl font-semibold text-slate-400">
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
