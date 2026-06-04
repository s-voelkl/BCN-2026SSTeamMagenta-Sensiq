import Card from './Card'
import type { KPI } from '../types/dashboard'
import type { SensorData } from '../types/dashboard'

interface KPICardProps {
  kpi: KPI
  data: SensorData
}

export default function KPICard({ kpi, data }: KPICardProps) {

  const value = data[kpi.measure]

  return (
    <Card className="h-full flex flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 horizontal-and-vertical-center">
        {kpi.label}
      </p>

      <p className="mt-3 font-mono text-5xl font-bold tabular-nums text-slate-50">
        {value}{kpi.unit}
      </p>
    </Card>
  )
}
