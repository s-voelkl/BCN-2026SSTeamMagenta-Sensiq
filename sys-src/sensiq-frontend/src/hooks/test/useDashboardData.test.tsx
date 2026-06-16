import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useLiveData,
  useHistoryData,
  mockLiveData,
  mockLiveDataActiveDevice,
  mockHistoryData,
} from '../useDashboardData'
import {
  SensorSchemaLive,
  SensorHistorySchema,
  type SensorDataLive,
  type SensorDataHistory,
} from '../../types/dashboard'

// Each test gets a fresh client with retries off so a failed query surfaces immediately.
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

// Build a fetch Response-like object for the mocked global fetch.
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response
}

// Complete live reading (exactly the fields SensorSchemaLive requires).
function makeLive(overrides: Partial<SensorDataLive> = {}): SensorDataLive {
  return {
    timestamp: '2026-06-13T10:00:00Z',
    device_id: 'esp32-lab-001',
    location: 'Lab A',
    dht_humidity: 50,
    dht_temperature: 25,
    dht_heat_index: 24,
    flame_analog: 0,
    thermistor_temp: 24,
    bme_temperature: 22,
    bme_humidity: 44,
    bme_pressure: 964,
    bme_altitude: 411,
    bme_voc: 215,
    tsl_lux: 361,
    ...overrides,
  }
}

// Complete history row (exactly the fields SensorSchemaHistory requires).
function makeHistoryRow(overrides: Partial<SensorDataHistory> = {}): SensorDataHistory {
  return {
    running_time: 1,
    timestamp: '2026-06-13T10:00:00Z',
    device_id: 'esp32-lab-001',
    location: 'Lab A',
    dht_humidity: 50,
    dht_temperature: 25,
    dht_heat_index: 24,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2000,
    thermistor_digital: false,
    thermistor_temp: 24,
    bme_heated_up: true,
    bme_temperature: 22,
    bme_humidity: 44,
    bme_pressure: 964,
    bme_altitude: 411,
    bme_voc: 215,
    tsl_lux: 361,
    is_outlier: false,
    collect_training: false,
    ...overrides,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  // the history fetch logs to console.error on a bad payload; keep test output clean
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useLiveData', () => {
  it('starts in a loading state before the request resolves', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {})) // never resolves
    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('fetches and schema-parses the live reading on success', async () => {
    const fetched = makeLive({ device_id: 'esp32-fetched', dht_temperature: 30 })
    fetchMock.mockResolvedValue(jsonResponse(fetched))

    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(fetched)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/live'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('errors with the status when the response is not ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }))

    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('HTTP 500')
  })

  it('errors when the payload fails schema validation', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ not: 'a sensor reading' }))

    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useHistoryData', () => {
  it('starts in a loading state before the request resolves', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {})) // never resolves
    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  // The Lambda wraps its rows in { data: [...] }; the hook has to unwrap them.
  it('unwraps the { data: [...] } envelope on success', async () => {
    const rows = [makeHistoryRow({ device_id: 'esp32-h1' }), makeHistoryRow({ device_id: 'esp32-h2' })]
    fetchMock.mockResolvedValue(jsonResponse({ data: rows }))

    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(rows)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/history'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  // A bare array (missing the { data } wrapper) must be rejected by the schema.
  it('errors when the payload is not wrapped in { data }', async () => {
    fetchMock.mockResolvedValue(jsonResponse([makeHistoryRow()]))

    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  // Each range maps to a fixed aggregation interval, sent as `precision` in the body.
  it('sends the aggregation interval that matches the selected range', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))

    renderHook(() => useHistoryData('1W'), { wrapper: createWrapper() })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.precision).toBe('1_hour') // IntervalMapper['1W']
  })

  it('errors with the status when the response is not ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }))

    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('HTTP 503')
  })
})

// The mock objects are used as fallback/demo data, so they must stay schema-valid.
describe('mock data contracts', () => {
  it('mockLiveData matches the live sensor schema', () => {
    expect(() => SensorSchemaLive.parse(mockLiveData)).not.toThrow()
  })

  it('mockLiveDataActiveDevice matches the live sensor schema', () => {
    expect(() => SensorSchemaLive.parse(mockLiveDataActiveDevice)).not.toThrow()
  })

  it('mockHistoryData matches the history schema', () => {
    expect(() => SensorHistorySchema.parse(mockHistoryData)).not.toThrow()
  })

  it('mockLiveData carries a parseable ISO timestamp', () => {
    expect(Number.isNaN(Date.parse(mockLiveData.timestamp))).toBe(false)
  })
})
