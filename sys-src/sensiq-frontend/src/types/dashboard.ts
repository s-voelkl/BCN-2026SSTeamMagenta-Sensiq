// src/types/sensor.ts
import { z } from 'zod'

export type KPIs = KPI[]

export type KPI = {
  id: string
  label: string
  unit: string
  measure: "dht_temperature" | "dht_humidity" | "flame_analog" // add more measures as needed, must match keys in SensorData
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