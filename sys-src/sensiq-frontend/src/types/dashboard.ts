// src/types/sensor.ts
import { z } from 'zod'

export type KPIs = KPI[]

export type measures = "dht_temperature" | "dht_humidity" | "flame_analog" // add more measures as needed, must match keys in SensorData

export type TimeRanges = '1H' | '6H' | '1D' | '1W' | '1M' | '1Y'

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
  data:    SensorHistory
  measure: measures 
  label:   string
  unit?:   string
  color?:  string
  onRangeChange?: (range: TimeRanges) => void
  range?: TimeRanges
  className?: string
}


export const SensorSchema = z.object({
  running_time:        z.number(),
  timestamp:           z.string(),
  device_id:           z.string(),
  location:            z.string(),
  dht_humidity:        z.number(),
  dht_temperature:     z.number(),
  dht_heat_index:      z.number(),
  flame_analog:        z.number(),
  flame_digital:       z.boolean(),
  thermistor_analog:   z.number(),
  thermistor_digital:  z.boolean(),
  thermistor_temp:     z.number(),
})

export type SensorData = z.infer<typeof SensorSchema>

export const SensorHistorySchema = z.array(SensorSchema)
export type SensorHistory = z.infer<typeof SensorHistorySchema>