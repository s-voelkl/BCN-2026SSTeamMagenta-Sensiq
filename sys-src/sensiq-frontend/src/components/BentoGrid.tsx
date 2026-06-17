import Greeting from './Greeting'
import { useHistoryData, useLiveData, isDeviceOffline } from '../hooks/useDashboardData'
import KPICard from './KPICard'
import type { KPIs, TimeRanges } from '../types/dashboard'
import { useState } from 'react'
import SensorChart from './SensorChart'

// Lookup tables => less writing effort
const colSpanClass = {
  1: 'col-span-1', 2: 'col-span-2',
  3: 'col-span-3', 4: 'col-span-4', 5: 'col-span-5',
} as const

const rowSpanClass = {
  1: 'row-span-1', 2: 'row-span-2',
  3: 'row-span-3', 4: 'row-span-4',
} as const

const KPI: KPIs = [
  { id: '1', label: 'Temperature', unit: ' °C', measure: 'bme_temperature', colSpan: 1, rowSpan: 2, rowStart: 1, colStart: 1 },
  { id: '2', label: 'Humidity', unit: '%', measure: 'bme_humidity', colSpan: 1, rowSpan: 2, rowStart: 1, colStart: 2 },
  { id: '3', label: 'Flame', unit: '', measure: 'flame_digital', colSpan: 1, rowSpan: 2, rowStart: 5, colStart: 4 },
  { id: '4', label: 'Light Intensity', unit: ' lux', measure: 'tsl_lux', colSpan: 1, rowSpan: 2, rowStart: 3, colStart: 4 },
  { id: '5', label: 'Pressure', unit: ' hPa', measure: 'bme_pressure', colSpan: 1, rowSpan: 2, rowStart: 1, colStart: 3 },
  { id: '6', label: 'Gases', unit: ' ppb', measure: 'bme_voc', colSpan: 1, rowSpan: 2, rowStart: 1, colStart: 4 },
  // add more KPIs as needed
]

/** Main dashboard: loads the live and history data and lays out the KPI cards and chart in a grid. */
export default function BentoGrid() {
  const { data, isLoading, isError, error } = useLiveData()

  const deviceId = data?.device_id || "Device Offline"
  // Translate the live query state into per-KPI flags.
  const offline = isError && isDeviceOffline(error)
  const failed = !isLoading && !offline && !data // generic error or unexpectedly missing data

  const [range, setRange] = useState<TimeRanges>('1D')
  const {
    data: historyData,
    isLoading: historyLoading,
    isFetching: historyFetching,
    isError: historyError,
  } = useHistoryData(range)

  return (
    <div className="space-y-4">
      {/* Header — always visible, even while loading or on error */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-5 backdrop-blur-sm">
        <Greeting deviceId={deviceId} timestamp={data?.timestamp} />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:grid-cols-4" style={{ gridAutoRows: '80px' }}>
        {KPI.map(kpi => (
          <div key={kpi.id}
            className={[
              colSpanClass[kpi.colSpan ?? 1],
              rowSpanClass[kpi.rowSpan ?? 1],
            ].join(' ')}
            style={{
              gridColumnStart: kpi.colStart,
              gridRowStart: kpi.rowStart,
            }}>
            <KPICard key={kpi.id} kpi={kpi} data={data} loading={isLoading} offline={offline} error={failed} />
          </div>
        ))}
        {/* Chart */}
        <div className="col-span-3 row-span-4 col-start-1 row-start-3">
          <SensorChart
            data={historyData ?? []}
            measure="bme_temperature"
            range={range}
            onRangeChange={setRange}
            loading={historyLoading}
            fetching={historyFetching}
            error={historyError}
          />
        </div>
      </div>
    </div>
  )
}
