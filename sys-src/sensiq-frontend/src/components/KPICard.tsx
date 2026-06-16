import Card from './Card'
import type { KPI } from '../types/dashboard'
import type { SensorDataLive } from '../types/dashboard'

interface KPICardProps {
  kpi: KPI
  data: SensorDataLive
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

/** A single dashboard tile that shows one sensor value with its unit and a label. */
export default function KPICard({ kpi, data }: KPICardProps) {

  let value = data[kpi.measure]
  if(typeof value === 'number' && kpi.measure !== "dht_temperature") value = transformInteger(value)
  if(typeof value === 'number' && kpi.measure === "dht_temperature") value = transformDecimal(value)
  const className = "text-2xl font-semibold font-mono tracking-[0.15em] tabular-nums text-slate-50"

  return (  
    <Card className="h-full flex flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 horizontal-and-vertical-center">
        {kpi.label}
      </p>

      <div className="mt-3 flex items-baseline justify-center gap-1.5">
        <p className={kpi.measure === 'flame_analog' ? className : "font-mono text-5xl font-bold tabular-nums text-slate-200"}
           style={kpi.measure === 'flame_analog'? {color: data.flame_analog === 0 ? "#2abe9bff" : "#EF4444"}: {}}>
          {kpi.measure === 'flame_analog' ? transformFlame(value) : `${value}`}
        </p>
        {kpi.unit && (
          <p className="font-mono text-3xl font-semibold text-slate-400">
            {kpi.unit}
          </p>
        )}
      </div>
    </Card>
  )
}
