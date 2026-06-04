import { useQuery } from '@tanstack/react-query'
import { /* SensorSchema,*/ type SensorData } from '../types/dashboard'

export const mockData: SensorData = {
    running_time: 111164587,
    timestamp: "2026-05-28T00:39:39Z",
    device_id: "esp32-lab-001",
    location: "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
    dht_humidity: 51,
    dht_temperature: 25.1,
    dht_heat_index: 24.99697,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2027,
    thermistor_digital: false,
    thermistor_temp: 24.5484
}

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
  return mockData // replace this line with the above code to fetch real data from the API
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
const fetchHistoryData = async (): Promise<SensorData> => {
  // const res = await fetch('https://jsonplaceholder.typicode.com/todos/1', {
  //   // headers: {
  //   //   'x-api-key':    "<Replace API Key here>",
  //   //   'Content-Type': 'application/json',
  //   // },
  // })
  // if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch dashboard data`)
  // return res.json()
  return mockData // replace this line with the above code to fetch real data from the API
}

// not in use yet
export function useHistoryData() {
  return useQuery<SensorData>({
    queryKey: ['historyData'],
    queryFn: fetchHistoryData,
    staleTime: 0,
  })
}
