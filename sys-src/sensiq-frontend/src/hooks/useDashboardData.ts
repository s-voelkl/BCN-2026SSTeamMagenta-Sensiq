import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { HistoryResponseSchema, SensorSchemaLive, IntervalMapper, type AggregationInterval, type SensorDataLive, type SensorDataHistory, type TimeRanges } from '../types/dashboard'

const api_key = import.meta.env.VITE_API_KEY;
const api_url = import.meta.env.VITE_API_URL;

// Error thrown for a non-2xx response. Keeps the status code and any JSON body
// (e.g. the 437 { message: "Device is offline", last_seen } payload) so the UI can
// tell "offline" apart from other failures.
export class ApiError extends Error {
  status: number
  info?: { message?: string; last_seen?: string }
  constructor(status: number, info?: { message?: string; last_seen?: string }) {
    super(info?.message ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.info = info
  }
}

/** True when the live endpoint reports the device as offline (HTTP 437 / "offline" message). */
export function isDeviceOffline(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 437 || /offline/i.test(error.info?.message ?? ''))
  )
}

/** Fetches the latest live reading from the API Gateway and validates it against the schema. */
const fetchLiveData = async (deviceId: string): Promise<SensorDataLive> => {
  const res = await fetch(`${api_url}/live`, {
    method: "POST",
    headers: {
      'x-api-key': api_key,
      'Content-Type': 'application/json',
    },
     body: JSON.stringify({ device_id: deviceId }),
  })
  if (!res.ok) {
    // Surface the JSON error body so the dashboard can detect the offline case.
    const info = await res.json().catch(() => undefined)
    throw new ApiError(res.status, info)
  }
  return SensorSchemaLive.parse(await res.json())
}

/** React Query hook that loads the live data and refetches it every 5 seconds. */
export function useLiveData(deviceId: string) {
  return useQuery<SensorDataLive>({
    queryKey: ['liveData', deviceId],
    queryFn: () => fetchLiveData(deviceId),
    refetchInterval: 5000, // Refetch every 5 seconds for live updates
    staleTime: 0,
    enabled: deviceId.trim().length > 0,
  })
}

/**
 * Fetches historical readings for the device and unwraps the { data: [...] } response.
 * @param interval how much the backend aggregates the data (defaults to 10 minutes)
 */
const fetchHistoryData = async (
  deviceId: string,
  interval: AggregationInterval = '10_minutes',
): Promise<SensorDataHistory[]> => {
  const res = await fetch(`${api_url}/history`, {
    method: "POST",
    headers: {
      'x-api-key': api_key,
      'Content-Type': 'application/json',
    },
        body: JSON.stringify({ device_id: deviceId, precision: interval })
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
export function useHistoryData(deviceId: string, range: TimeRanges) {
  const interval = IntervalMapper[range]
  return useQuery<SensorDataHistory[]>({
    queryKey: ['historyData', deviceId, range, interval],
    queryFn: () => fetchHistoryData(deviceId, interval),
    staleTime: 0,
    // Keep the previous range's data on screen while the new range loads,
    // so switching ranges doesn't blank the chart (isLoading only fires on first load).
    placeholderData: keepPreviousData,
    enabled: deviceId.trim().length > 0,
  })
}
