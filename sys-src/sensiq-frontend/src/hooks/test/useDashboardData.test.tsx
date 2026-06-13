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
import { SensorSchema, SensorHistorySchema, type SensorData } from '../../types/dashboard'

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

// Build a Response-like object for the mocked fetch.
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response
}

// Minimal valid sensor reading (only the schema-required fields).
function makeSensor(overrides: Partial<SensorData> = {}): SensorData {
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
    ...overrides,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  // the live fetch logs the api key on every call; keep test output clean
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useLiveData', () => {
  it('serves the mock placeholder data before the request resolves', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {})) // never resolves
    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() })

    expect(result.current.data).toEqual(mockLiveData)
    expect(result.current.isPlaceholderData).toBe(true)
  })

  it('fetches and schema-parses the live reading on success', async () => {
    const fetched = makeSensor({ device_id: 'esp32-fetched', dht_temperature: 30 })
    fetchMock.mockResolvedValue(jsonResponse(fetched))

    const { result } = renderHook(() => useLiveData(), { wrapper: createWrapper() })
    // wait for the real fetch to replace the placeholder data
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))

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
  it('serves the mock placeholder data before the request resolves', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {})) // never resolves
    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })

    expect(result.current.data).toEqual(mockHistoryData)
    expect(result.current.isPlaceholderData).toBe(true)
  })

  it('fetches the history payload on success', async () => {
    const fetched = [makeSensor({ device_id: 'esp32-h1' }), makeSensor({ device_id: 'esp32-h2' })]
    fetchMock.mockResolvedValue(jsonResponse(fetched))

    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })
    // wait for the real fetch to replace the placeholder data
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))

    expect(result.current.data).toEqual(fetched)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/history'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('errors with the status when the response is not ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }))

    const { result } = renderHook(() => useHistoryData('1D'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toContain('HTTP 503')
  })
})

describe('mock data contracts', () => {
  it('mockLiveData matches the sensor schema', () => {
    expect(() => SensorSchema.parse(mockLiveData)).not.toThrow()
  })

  it('mockLiveDataActiveDevice matches the sensor schema', () => {
    expect(() => SensorSchema.parse(mockLiveDataActiveDevice)).not.toThrow()
  })

  it('mockHistoryData matches the sensor history schema', () => {
    expect(() => SensorHistorySchema.parse(mockHistoryData)).not.toThrow()
  })

  it('mockLiveDataActiveDevice carries a fresh (recent) timestamp', () => {
    const age = Date.now() - new Date(mockLiveDataActiveDevice.timestamp).getTime()
    // generated at module load, so it should be well under an hour old in a test run
    expect(age).toBeLessThan(60 * 60 * 1000)
    expect(age).toBeGreaterThanOrEqual(0)
  })
})
