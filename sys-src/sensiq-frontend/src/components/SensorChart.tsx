import { useMemo, useState } from 'react'
import {
  AreaChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import Card from './Card'
import { MEASURE_META, type SensorChartProps, type measuresExFlame } from '../types/dashboard'

// The measures the dropdown offers, in display order (keys of MEASURE_META).
const MEASURE_OPTIONS = Object.keys(MEASURE_META) as measuresExFlame[]

// Threshold colours used by the historical chart.
const NORMAL_COLOR = '#2abe9b'
const CRITICAL_COLOR = '#EF4444'

// time range lookup table
const TIME_RANGES = [
  { label: '1H', ms: 1000 * 60 * 60 },
  { label: '6H', ms: 1000 * 60 * 60 * 6 },
  { label: '1D', ms: 1000 * 60 * 60 * 24 },
  { label: '1W', ms: 1000 * 60 * 60 * 24 * 7 },
  { label: '1M', ms: 1000 * 60 * 60 * 24 * 30 },
  { label: '1Y', ms: 1000 * 60 * 60 * 24 * 365 }
] as const

type ThresholdLevel = 'normal' | 'critical'

type ChartPoint = {
  time: number
  value: number
  level: ThresholdLevel
  normalValue: number | null
  criticalValue: number | null
}

function getThresholdLevel(measure: measuresExFlame, value: number): ThresholdLevel {
  switch (measure) {
    case 'bme_temperature':
      if (value < 10.00 || value >= 35.00) return 'critical'
      return 'normal'

    case 'bme_humidity':
      if (value < 20 || value > 80) return 'critical'
      return 'normal'

    case 'bme_pressure':
      if (value < 900 || value > 1100) return 'critical'
      return 'normal'

    case 'bme_voc':
      if (value > 250) return 'critical'
      return 'normal'

    case 'tsl_lux':
      if (value > 1000) return 'critical'
      return 'normal'

    default:
      return 'normal'
  }
}

function createChartPoint(time: number, value: number, level: ThresholdLevel): ChartPoint {
  return {
    time,
    value,
    level,
    normalValue: level === 'normal' ? value : null,
    criticalValue: level === 'critical' ? value : null,
  }
}

function addValueToLevel(point: ChartPoint, level: ThresholdLevel): ChartPoint {
  return {
    ...point,
    normalValue: level === 'normal' ? point.value : point.normalValue,
    criticalValue: level === 'critical' ? point.value : point.criticalValue,
  }
}

type TooltipProps = {
  active?: boolean
  payload?: { value: number }[]
  label?: number // epoch ms (numeric time axis)
  unit?: string
  showDate?: boolean // wide ranges (>1D) label points by date, not time
}


/** Custom tooltip for the chart: shows the hovered points time and its value. */
function CustomTooltip({ active, payload, label, unit, showDate }: TooltipProps) {
  if (!active || !payload?.length) return null
  const when =
    label != null
      ? new Date(label).toLocaleString('en-US', showDate
        ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : ''
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/95 px-4 py-3 text-sm shadow-xl backdrop-blur-sm">
      <p className="mb-1 font-mono text-xs text-slate-400">{when}</p>
      <p className="font-mono font-bold text-slate-50">
        {payload[0].value.toFixed(2)}{unit}
      </p>
    </div>
  )
}


/** Small spinning loading indicator. */
function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
  )
}

/**
 * Historical line chart with a dropdown to pick which measure to plot.
 * The name, unit and colour are looked up from MEASURE_META, so selecting a
 * measure automatically updates the line, axis and tooltip.
 */
export default function SensorChart({
  data,
  measure = 'bme_temperature',
  range = '1D',
  onRangeChange,
  className,
  loading = false,
  fetching = false,
  error = false,
}: SensorChartProps) {
  // Which measure is currently shown; the dropdown updates this.
  const [selected, setSelected] = useState<measuresExFlame>(measure)
  const { unit } = MEASURE_META[selected]

  const filtered = useMemo(() => {
    if (!data?.length) return []
    const selectedMs = TIME_RANGES.find(r => r.label === range)!.ms

    // API returns newest-first; sort ascending so the X-axis runs left→right
    // and `latest` points at the most recent sample.
    const sorted = [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const latest = new Date(sorted.at(-1)!.timestamp).getTime()
    const cutoff = latest - selectedMs

    return sorted.filter(d => new Date(d.timestamp).getTime() >= cutoff)
  }, [data, range])

  const chartData = useMemo(() => {
    const points = filtered
      .map(d => {
        const value = Number(d[selected])
        const time = new Date(d.timestamp).getTime()

        if (Number.isNaN(value) || Number.isNaN(time)) return null

        return createChartPoint(time, value, getThresholdLevel(selected, value))
      })
      .filter((point): point is ChartPoint => point !== null)

    return points.map((point, index) => {
      const previous = points[index - 1]
      let connectedPoint = point

      if (previous && previous.level !== point.level) {
        connectedPoint = addValueToLevel(connectedPoint, previous.level)
      }

      return connectedPoint
    })
  }, [filtered, selected])

  // For ranges wider than a day, label the X-axis (and tooltip) by date instead of time.
  const showDate = TIME_RANGES.find(r => r.label === range)!.ms > 1000 * 60 * 60 * 24

  const formatXTick = (t: number) =>
    new Date(t).toLocaleString('en-US', showDate
      ? { month: 'short', day: 'numeric' }
      : { hour: '2-digit', minute: '2-digit' })

  const normalGradientId = `grad-${selected}-normal`
  const criticalGradientId = `grad-${selected}-critical`

  return (
    <Card className={"h-full flex flex-col overflow-hidden " + (className || '')}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.15em]" >
            Historical
          </p>
          <select
            aria-label="Select measure"
            value={selected}
            onChange={e => setSelected(e.target.value as measuresExFlame)}
            className="cursor-pointer rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-sm font-semibold text-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-700"
          >
            {MEASURE_OPTIONS.map(m => (
              <option
                key={m}
                value={m}
                // Inline styles so the opened option list keeps the dark theme + DM Mono
                style={{ backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: '"DM Mono", monospace' }}
              >
                {MEASURE_META[m].label} ({MEASURE_META[m].unit})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
          {TIME_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => onRangeChange?.(r.label)}
              className={[
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                range === r.label
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
              style={{ backgroundColor: range === r.label ? "#2abe9bff" : "" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {/* Background refetch (e.g. range switch): previous data stays visible. */}
        {fetching && !loading && !error && (
          <div className="absolute right-1 top-1 z-10 flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-[11px] font-medium text-slate-400">
            <Spinner /> Updating…
          </div>
        )}

        {/* No data to plot yet: show a message over an empty chart instead of a skeleton. */}
        {(loading || error) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            {error ? (
              <span className="text-sm font-medium text-rose-400">Failed to load data</span>
            ) : (
              <span className="flex items-center gap-2 text-sm font-medium text-slate-400">
                <Spinner /> Loading data…
              </span>
            )}
          </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={normalGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={NORMAL_COLOR} stopOpacity={0.25} />
                <stop offset="95%" stopColor={NORMAL_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={criticalGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CRITICAL_COLOR} stopOpacity={0.25} />
                <stop offset="95%" stopColor={CRITICAL_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXTick}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
              domain={['auto', 'auto']}
              tickFormatter={v => v.toFixed(2)}
            />

            <Tooltip content={<CustomTooltip unit={unit} showDate={showDate} />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />

            <Area
              type="linear"
              dataKey="normalValue"
              stroke="none"
              fill={`url(#${normalGradientId})`}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="criticalValue"
              stroke="none"
              fill={`url(#${criticalGradientId})`}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="normalValue"
              stroke={NORMAL_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: NORMAL_COLOR, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="criticalValue"
              stroke={CRITICAL_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: CRITICAL_COLOR, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
