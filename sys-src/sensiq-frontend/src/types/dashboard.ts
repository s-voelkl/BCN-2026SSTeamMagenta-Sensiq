// src/types/sensor.ts
import { z } from 'zod'

// helper function to fix zods boolen confusion
const zStringBool = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : Boolean(v)),
  z.boolean(),
)

export type KPIs = KPI[]

export type measuresExFlame = "dht_temperature" | "dht_humidity" | "bme_pressure" | "tsl_lux" | "bme_voc" // measurement that are selectable in the dropdown menue

export type measures = measuresExFlame | "flame_analog"  // add more measures as needed, must match keys in SensorData

// Readable name and unit for each selectable measure. The chart's dropdown is
// built straight from these entries.
export const MEASURE_META: Record<measuresExFlame, { label: string; unit: string }> = {
  dht_temperature: { label: 'Temperature', unit: '°C' },
  dht_humidity:    { label: 'Humidity',    unit: '%' },
  bme_pressure:    { label: 'Pressure',    unit: 'hPa' },
  tsl_lux:         { label: 'Light',       unit: 'lux' },
  bme_voc:         { label: 'Gases (VOC)', unit: 'ppb' },
}

export type TimeRanges = '1H' | '6H' | '1D' | '1W' | '1M' | '1Y'

// Server-side aggregation interval (variable precision). '10_minutes' is the API default.
export type AggregationInterval =
  | 'all' | '1_minute' | '10_minutes' | '1_hour'
  | '1_day' | '1_week' | '1_month' | '1_year'

// a Mapper for the aggregation periods, if selection in chart changes, the interval should change
export const IntervalMapper: Record<TimeRanges, AggregationInterval> = {
  '1H': '1_minute',
  '6H': '10_minutes',
  '1D': '10_minutes',
  '1W': '1_hour',
  '1M': '1_day',
  '1Y': '1_week',
}

export type KPI = {
  id: string
  label: string
  unit: string
  measure: measures
  colSpan?: 1 | 2 | 3 | 4 | 5
  rowSpan?: 1 | 2 | 3 | 4
  rowStart?: number // optional, for manual grid placement
  colStart?: number // optional, for manual grid placement
}

export interface SensorChartProps {
  data: SensorDataHistory[]
  measure?: measuresExFlame // initially selected measure; the dropdown can change it
  onRangeChange?: (range: TimeRanges) => void
  range?: TimeRanges
  className?: string
  loading?: boolean  // initial fetch, no data to show yet
  fetching?: boolean // background refetch (e.g. range switch) while previous data is shown
  error?: boolean
}

// validation schema => auto validates AND transforms API response
export const SensorSchemaLive = z.object({
  timestamp: z.coerce.string(),
  device_id: z.coerce.string(),
  location: z.coerce.string(),
  dht_humidity: z.coerce.number(),
  dht_temperature: z.coerce.number(),
  dht_heat_index: z.coerce.number(),
  flame_analog: z.coerce.number(),
  thermistor_temp: z.coerce.number(),
  bme_temperature: z.coerce.number(),
  bme_humidity: z.coerce.number(),
  bme_pressure: z.coerce.number(),
  bme_altitude: z.coerce.number(),
  bme_voc: z.coerce.number(),
  tsl_lux: z.coerce.number(),
})

export const SensorSchemaHistory = z.object({
  running_time: z.coerce.number(),
  timestamp: z.coerce.string(),
  device_id: z.coerce.string(),
  location: z.coerce.string(),
  dht_humidity: z.coerce.number(),
  dht_temperature: z.coerce.number(),
  dht_heat_index: z.coerce.number(),
  flame_analog: z.coerce.number(),
  flame_digital: zStringBool,
  thermistor_analog: z.coerce.number(),
  thermistor_digital: zStringBool,
  thermistor_temp: z.coerce.number(),
  bme_heated_up: zStringBool,
  bme_temperature: z.coerce.number(),
  bme_humidity: z.coerce.number(),
  bme_pressure: z.coerce.number(),
  bme_altitude: z.coerce.number(),
  bme_voc: z.coerce.number(),
  tsl_lux: z.coerce.number(),
  is_outlier: zStringBool,
  collect_training: zStringBool,
})


export type SensorDataLive = z.infer<typeof SensorSchemaLive>

export const SensorHistorySchema = z.array(SensorSchemaHistory)

// The /history Lambda wraps its rows: { "data": [ ...rows ] }
export const HistoryResponseSchema = z.object({
  data: SensorHistorySchema,
})

export type SensorDataHistory = z.infer<typeof SensorSchemaHistory>