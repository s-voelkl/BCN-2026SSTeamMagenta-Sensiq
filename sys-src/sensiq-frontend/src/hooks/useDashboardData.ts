import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { HistoryResponseSchema, SensorSchemaLive, IntervalMapper, type AggregationInterval, type SensorDataLive, type SensorDataHistory, type TimeRanges } from '../types/dashboard'

const api_key = import.meta.env.VITE_API_KEY;
const api_url = import.meta.env.VITE_API_URL;

export const mockLiveDataActiveDevice: SensorDataLive = {
  timestamp: "2026-06-15T12:45:00Z",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 61,
  dht_temperature: 20.4,
  dht_heat_index: 20.08813,
  flame_analog: 1208,
  thermistor_temp: 30.12444,
  bme_temperature: 22.12171,
  bme_humidity: 43.08777,
  bme_pressure: 964.742,
  bme_altitude: 411.8892,
  bme_voc: 227.5038,
  tsl_lux: 338.2
}

export const mockLiveData: SensorDataLive = {
  timestamp: "2026-06-15T12:45:00Z",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 61,
  dht_temperature: 21.4,
  dht_heat_index: 21.08813,
  flame_analog: 1108,
  thermistor_temp: 28.12444,
  bme_temperature: 23.12171,
  bme_humidity: 44.08777,
  bme_pressure: 934.742,
  bme_altitude: 401.8892,
  bme_voc: 229.5038,
  tsl_lux: 332.2
}

export const mockData: SensorDataHistory =
{
  running_time: 2696015,
  timestamp: "2026-06-15T12:42:38Z",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 64.4,
  dht_temperature: 20.5,
  dht_heat_index: 20.28691,
  flame_analog: 2113,
  flame_digital: false,
  thermistor_analog: 2306,
  thermistor_digital: false,
  thermistor_temp: 30.8895,
  bme_heated_up: true,
  bme_temperature: 22.17609,
  bme_humidity: 44.2793,
  bme_pressure: 964.786,
  bme_altitude: 411.4736,
  bme_voc: 215.8898,
  tsl_lux: 361.2,
  is_outlier: false,
  collect_training: false
}

export const mockHistoryData: SensorDataHistory[] = [
  {
  running_time: 2696015,
  timestamp: "2026-06-15T12:42:38Z",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 64.4,
  dht_temperature: 20.5,
  dht_heat_index: 20.28691,
  flame_analog: 2113,
  flame_digital: false,
  thermistor_analog: 2306,
  thermistor_digital: false,
  thermistor_temp: 30.8895,
  bme_heated_up: true,
  bme_temperature: 22.17609,
  bme_humidity: 44.2793,
  bme_pressure: 964.786,
  bme_altitude: 411.4736,
  bme_voc: 215.8898,
  tsl_lux: 361.2,
  is_outlier: false,
  collect_training: false
},
{
  running_time: 2687133,
  timestamp: "2026-06-15T12:42:29Z",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 64.4,
  dht_temperature: 20.5,
  dht_heat_index: 20.28691,
  flame_analog: 2113,
  flame_digital: false,
  thermistor_analog: 2290,
  thermistor_digital: false,
  thermistor_temp: 30.51563,
  bme_heated_up: true,
  bme_temperature: 22.1749,
  bme_humidity: 44.18906,
  bme_pressure: 964.776,
  bme_altitude: 411.5598,
  bme_voc: 212.3124,
  tsl_lux: 374.2,
  is_outlier: false,
  collect_training: false
},
{
  running_time: 2678280,
  timestamp: "2026-06-15 12:42:20.000",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 64,
  dht_temperature: 20.5,
  dht_heat_index: 20.27646,
  flame_analog: 2158,
  flame_digital: false,
  thermistor_analog: 2310,
  thermistor_digital: false,
  thermistor_temp: 30.98834,
  bme_heated_up: true,
  bme_temperature: 22.1754,
  bme_humidity: 43.91667,
  bme_pressure: 964.774,
  bme_altitude: 411.5945,
  bme_voc: 215.8638,
  tsl_lux: 388.6,
  is_outlier: false,
  collect_training: false
}
]

/** Fetches the latest live reading from the API Gateway and validates it against the schema. */
const fetchLiveData = async (): Promise<SensorDataLive> => {
  const res = await fetch(`${api_url}/live`, {
    method: "POST",
    headers: {
      'x-api-key': api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_id: "esp32-lab-001" }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch dashboard data`)
  return SensorSchemaLive.parse(await res.json())
}

/** React Query hook that loads the live data and refetches it every 5 seconds. */
export function useLiveData() {
  return useQuery<SensorDataLive>({
    queryKey: ['liveData'],
    queryFn: fetchLiveData,
    refetchInterval: 5000, // Refetch every 5 seconds for live updates
    staleTime: 0,
  })
}

// not in use yet
// excerpt from the history data fetching function, see sensiq-aws/src/lambda/history:
// parameters:
// 			* ``limit``(str, optional): Maximum number of records to return
// (default ``100``, capped at: data: `MAX_RESULT_LIMIT`).
// 			* ``startDate``(str, optional): Inclusive start timestamp in ISO 8601
// format, e.g. ``"2026-05-25T00:00:00Z"``.
// 			* ``endDate``(str, optional): Inclusive end timestamp in ISO 8601 format.
// 			* ``interval``(str, optional): Aggregation interval (variable precision).
// One of: all, 1_minute, 10_minutes (default), 1_hour, 1_day, 1_week, 1_month, 1_year.
// example:
// "queryStringParameters": {
//   "limit": "10",
//   "startDate": "2026-01-01T00:00:00Z",
//   "endDate": "2028-12-31T23:59:59Z"
// }
/**
 * Fetches historical readings for the device and unwraps the { data: [...] } response.
 * @param interval how much the backend aggregates the data (defaults to 10 minutes)
 */
const fetchHistoryData = async (
  interval: AggregationInterval = '10_minutes',
): Promise<SensorDataHistory[]> => {
  const res = await fetch(`${api_url}/history`, {
    method: "POST",
    headers: {
      'x-api-key': api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_id: 'esp32-lab-001', precision: interval })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch dashboard data`)

  // The Lambda responds with { "data": [ ...rows ] }, so unwrap before returning.
  const parsed = HistoryResponseSchema.safeParse(await res.json())
  if (!parsed.success) {
    console.error('history schema mismatch:', parsed.error.issues)
    throw parsed.error
  }
  return parsed.data.data
}

/**
 * React Query hook for historical data of the given time range.
 * Picks the matching aggregation interval and keeps the previous data while refetching.
 * @param range the selected time window (e.g. '1D', '1W')
 */
export function useHistoryData(range: TimeRanges) {
  const interval = IntervalMapper[range]
  return useQuery<SensorDataHistory[]>({
    queryKey: ['historyData', range, interval],
    queryFn: () => fetchHistoryData(interval),
    staleTime: 0,
    // Keep the previous range's data on screen while the new range loads,
    // so switching ranges doesn't blank the chart (isLoading only fires on first load).
    placeholderData: keepPreviousData,
  })
}
