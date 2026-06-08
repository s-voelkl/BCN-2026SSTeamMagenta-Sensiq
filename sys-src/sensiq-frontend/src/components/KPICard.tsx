import Card from './Card'
import type { KPI } from '../types/dashboard'
import type { SensorData } from '../types/dashboard'

interface KPICardProps {
  kpi: KPI
  data: SensorData
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

export default function KPICard({ kpi, data }: KPICardProps) {

  let value = data[kpi.measure]
  if(typeof value === 'number') value = transformDecimal(value)
  const className = "text-2xl font-semibold font-mono tracking-[0.15em] tabular-nums text-slate-50"

  return (
    <Card className="h-full flex flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 horizontal-and-vertical-center">
        {kpi.label}
      </p>

      <p className={kpi.measure === 'flame_analog' ? className : "mt-3 font-mono text-5xl font-bold tabular-nums"}
         style={kpi.measure === 'flame_analog'? {color: data.flame_analog === 0 ? "#2abe9bff" : "#EF4444"}: {color: "lightgray"}}>
        {kpi.measure === 'flame_analog' ? transformFlame(value) : `${value}${kpi.unit}`}
      </p>
    </Card>
  )
}
