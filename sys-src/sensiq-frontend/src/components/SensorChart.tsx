import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import Card from './Card'
import type {SensorChartProps } from '../types/dashboard'


// time range lookup table
const TIME_RANGES = [
  { label: '1H',  ms: 1000 * 60 * 60           },
  { label: '6H',  ms: 1000 * 60 * 60 * 6       },
  { label: '1D',  ms: 1000 * 60 * 60 * 24      },
  { label: '1W',  ms: 1000 * 60 * 60 * 24 * 7  },
  { label: '1M',  ms: 1000 * 60 * 60 * 24 * 30 },
  { label: '1Y',  ms: 1000 * 60 * 60 * 24 * 365 }
] as const

type TooltipProps = {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  unit?: string
}


function CustomTooltip({ active, payload, label, unit }: TooltipProps) { // not well typed tbh
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/95 px-4 py-3 text-sm shadow-xl backdrop-blur-sm">
      <p className="mb-1 font-mono text-xs text-slate-400">{label}</p>
      <p className="font-mono font-bold text-slate-50">
        {payload[0].value}{unit}
      </p>
    </div>
  )
}


export default function SensorChart({
  data,
  measure,
  label,
  unit  = '',
  color = '#f59e0b',
  range = '1D',
  onRangeChange,
  className,
}: SensorChartProps) {
  const filtered = useMemo(() => {
    const selectedMs = TIME_RANGES.find(r => r.label === range)!.ms

    const latest = new Date(data.at(-1)!.timestamp).getTime()
    const cutoff = latest - selectedMs

    return data.filter(d => new Date(d.timestamp).getTime() >= cutoff)
  }, [data, range])

  const chartData = useMemo(() =>
    filtered.map(d => ({
      time:  new Date(d.timestamp).toLocaleTimeString('en-US', {
               hour: '2-digit', minute: '2-digit',
             }),
      value: d[measure] as number,
    })),
  [filtered, measure])

  const gradientId = `grad-${measure}`

  return (
    <Card className={"h-full flex flex-col overflow-hidden " + (className || '')}>
      <div className="mb-5 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            Historical
          </p>
          <p className="mt-0.5 text-lg font-bold text-slate-50">{label}</p>
        </div>

        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
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
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0}    />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
              domain={['auto', 'auto']}
            />

            <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
