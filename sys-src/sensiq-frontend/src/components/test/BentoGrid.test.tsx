import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SensorDataLive, SensorDataHistory } from '../../types/dashboard'

// Mock the data layer so we can drive BentoGrid through its loading / error /
// success states without touching react-query.
vi.mock('../../hooks/useDashboardData', () => ({
  useLiveData: vi.fn(),
  useHistoryData: vi.fn(),
}))

import { useLiveData, useHistoryData } from '../../hooks/useDashboardData'
import BentoGrid from '../BentoGrid'

const liveMock = vi.mocked(useLiveData)
const historyMock = vi.mocked(useHistoryData)

function makeSensor(overrides: Partial<SensorDataLive> = {}): SensorDataLive {
  return {
    timestamp: '2026-05-28T00:43:00Z',
    device_id: 'esp32-test',
    location: 'Lab A',
    dht_humidity: 51,
    dht_temperature: 25.1,
    dht_heat_index: 24.9,
    flame_analog: 0,
    thermistor_temp: 24.5,
    bme_temperature: 22,
    bme_humidity: 44,
    bme_pressure: 964,
    bme_altitude: 411,
    bme_voc: 215,
    tsl_lux: 361,
    ...overrides,
  }
}

const history: SensorDataHistory[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asResult = (r: Record<string, unknown>) => r as any

describe('BentoGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    historyMock.mockReturnValue(
      asResult({ data: history, isLoading: false, isFetching: false, isError: false }),
    )
  })

  it('shows the loading skeleton while live data is loading', () => {
    liveMock.mockReturnValue(asResult({ data: undefined, isLoading: true, isError: false }))
    render(<BentoGrid />)
    expect(screen.getByLabelText('Loading dashboard')).toBeInTheDocument()
    expect(screen.queryByText('esp32-test')).not.toBeInTheDocument()
  })

  it('shows an error message when the query errors', () => {
    liveMock.mockReturnValue(asResult({ data: undefined, isLoading: false, isError: true }))
    render(<BentoGrid />)
    expect(screen.getByText(/error occurred while loading the dashboard/i)).toBeInTheDocument()
  })

  it('shows an error message when there is no data even without an error flag', () => {
    liveMock.mockReturnValue(asResult({ data: undefined, isLoading: false, isError: false }))
    render(<BentoGrid />)
    expect(screen.getByText(/error occurred while loading the dashboard/i)).toBeInTheDocument()
  })

  it('renders the greeting, KPI cards and chart on success', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    expect(screen.getByText('esp32-test')).toBeInTheDocument()          // greeting device id
    expect(screen.getByText('Humidity')).toBeInTheDocument()
    expect(screen.getByText('Flame')).toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument()          // temperature KPI card
    expect(screen.getByText('Historical')).toBeInTheDocument()           // chart heading
  })

  // shows an inline "Loading data…" message while the history request is in flight.
  it('keeps the chart mounted and shows a loading message while history loads', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    historyMock.mockReturnValue(
      asResult({ data: undefined, isLoading: true, isFetching: true, isError: false }),
    )
    render(<BentoGrid />)

    expect(screen.getByText('Historical')).toBeInTheDocument() // frame still rendered
    expect(screen.getByText(/loading data/i)).toBeInTheDocument()
  })

  it('shows a failure message inside the chart when the history query errors', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    historyMock.mockReturnValue(
      asResult({ data: undefined, isLoading: false, isFetching: false, isError: true }),
    )
    render(<BentoGrid />)

    expect(screen.getByText(/failed to load data/i)).toBeInTheDocument()
  })
})
