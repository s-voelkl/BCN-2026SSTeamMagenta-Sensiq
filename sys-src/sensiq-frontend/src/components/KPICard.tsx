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
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
        {kpi.label}
      </p>

      <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-slate-50">
        {value} {kpi.unit}
      </p>
    </Card>
  )
}
