import { useQuery } from '@tanstack/react-query'
import { /* SensorSchema,*/ type SensorData, type SensorHistory, type TimeRanges } from '../types/dashboard'

export const mockLiveData: SensorData = {
  running_time: 111164587,
  timestamp: "2026-05-28T00:43:00Z",
  device_id: "esp32-lab-001",
  location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
  dht_humidity: 51,
  dht_temperature: 25.11111,
  dht_heat_index: 24.99697,
  flame_analog: 0,
  flame_digital: false,
  thermistor_analog: 2027,
  thermistor_digital: false,
  thermistor_temp: 24.5484,
  is_outlier: false,
  collect_training: false,
  outlier_prediction: false
}

export const mockHistoryData: SensorHistory = [
  {
    running_time: 111164587,
    timestamp: "2026-05-28T00:40:00Z", // 1 minute later
    device_id: "esp32-lab-001",
    location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
    dht_humidity: 51,
    dht_temperature: 25.7,
    dht_heat_index: 23.99697,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2025,
    thermistor_digital: false,
    thermistor_temp: 22.5484,
    is_outlier: false,
    collect_training: false,
    outlier_prediction: false
  },
  {
    running_time: 111164587,
    timestamp: "2026-05-28T00:41:00Z", // 1 minute later
    device_id: "esp32-lab-001",
    location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
    dht_humidity: 43,
    dht_temperature: 24.5,
    dht_heat_index: 24.0,
    flame_analog: 1,
    flame_digital: false,
    thermistor_analog: 4012,
    thermistor_digital: false,
    thermistor_temp: 23.93,
    is_outlier: false,
    collect_training: false,
    outlier_prediction: false
  },
  {
    running_time: 111164587,
    timestamp: "2026-05-28T00:42:00Z", // 1 minute later
    device_id: "esp32-lab-001",
    location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
    dht_humidity: 51,
    dht_temperature: 26.1,
    dht_heat_index: 25.99697,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2026,
    thermistor_digital: false,
    thermistor_temp: 23.5484,
    is_outlier: false,
    collect_training: false,
    outlier_prediction: false
  },
  mockLiveData
]

// this function fetches the live data from API Gateway and parses it using the SensorSchema
const fetchLiveData = async (): Promise<SensorData> => {
  // const res = await fetch('https://jsonplaceholder.typicode.com/todos/1', {
  //   // headers: {
  //   //   'x-api-key':    "<Replace API Key here>",
  //   //   'Content-Type': 'application/json',
  //   // },
  // })
  // if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch dashboard data`)
  // return SensorSchema.parse(await res.json())
  return mockLiveData // replace this line with the above code to fetch real data from the API
}

// fetches data every 5 seconds for live updates
export function useLiveData() {
  return useQuery<SensorData>({
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
// example: 
// "queryStringParameters": {
//   "limit": "10",
//   "startDate": "2026-01-01T00:00:00Z",
//   "endDate": "2028-12-31T23:59:59Z"
// }
const fetchHistoryData = async (): Promise<SensorHistory> => {
  // const res = await fetch('<REPLACE_WITH_API_ENDPOINT>?range={range}', {
  //   // headers: {
  //   //   'x-api-key':    "<Replace API Key here>",
  //   //   'Content-Type': 'application/json',
  //   // },
  // })
  // if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch dashboard data`)
  // return res.json()
  return mockHistoryData // replace this line with the above code to fetch real data from the API
}

// not in use yet
export function useHistoryData(range: TimeRanges) {
  return useQuery<SensorHistory>({
    queryKey: ['historyData', range],
    queryFn: () => fetchHistoryData(), // pass range as prop to fetch different time ranges from the API (remove for linting)
    staleTime: 0,
  })
}
