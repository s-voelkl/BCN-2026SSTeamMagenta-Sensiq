import Greeting from './Greeting'
// import KPICard from './KPICard'
import { useLiveData } from '../hooks/useDashboardData'
import KPICard from './KPICard'
import type { KPIs } from '../types/dashboard'

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={['animate-pulse rounded-2xl border border-slate-800 bg-slate-900/80', className].join(' ')} />
  )
}

const KPI: KPIs = [
  { id: '1', label: 'Temperature', unit: '°C', measure: 'dht_temperature' },
  { id: '2', label: 'Humidity', unit: '%', measure: 'dht_humidity' },
  { id: '3', label: 'Flame', unit: '', measure: 'flame_analog' },
  // add more KPIs as needed
]

export default function BentoGrid() {
  const { data, isLoading, isError } = useLiveData()

  const deviceId = data?.device_id || "Unknown Device"
  
  // Loading State
  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading dashboard">
        <SkeletonCard className="h-24" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <SkeletonCard className="h-72 lg:col-span-3" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-rose-900/50 bg-rose-950/20 text-rose-400">
        An error occurred while loading the dashboard data.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-5 backdrop-blur-sm">
        <Greeting deviceId={deviceId} />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPI.map(kpi => (
          <KPICard key={kpi.id} kpi={kpi} data={data} />
        ))}
      </div>
      {/* Chart */}

    </div>
  )
}
