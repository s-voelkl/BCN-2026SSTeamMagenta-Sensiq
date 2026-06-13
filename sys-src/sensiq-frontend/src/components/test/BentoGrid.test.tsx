import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SensorData, SensorHistory } from '../../types/dashboard'

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

function makeSensor(overrides: Partial<SensorData> = {}): SensorData {
  return {
    running_time: 1,
    timestamp: '2026-05-28T00:43:00Z',
    device_id: 'esp32-test',
    location: 'Lab A',
    dht_humidity: 51,
    dht_temperature: 25.1,
    dht_heat_index: 24.9,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2027,
    thermistor_digital: false,
    thermistor_temp: 24.5,
    ...overrides,
  }
}

const history: SensorHistory = [makeSensor()]

// Helpers to build the subset of the react-query result the component reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const liveResult = (r: Record<string, unknown>) => r as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const historyResult = (r: Record<string, unknown>) => r as any

describe('BentoGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    historyMock.mockReturnValue(historyResult({ data: history, isLoading: false }))
  })

  it('shows the loading skeleton while live data is loading', () => {
    liveMock.mockReturnValue(liveResult({ data: undefined, isLoading: true, isError: false }))
    render(<BentoGrid />)
    expect(screen.getByLabelText('Loading dashboard')).toBeInTheDocument()
    expect(screen.queryByText('esp32-test')).not.toBeInTheDocument()
  })

  it('shows an error message when the query errors', () => {
    liveMock.mockReturnValue(liveResult({ data: undefined, isLoading: false, isError: true }))
    render(<BentoGrid />)
    expect(screen.getByText(/error occurred while loading the dashboard/i)).toBeInTheDocument()
  })

  it('shows an error message when there is no data even without an error flag', () => {
    liveMock.mockReturnValue(liveResult({ data: undefined, isLoading: false, isError: false }))
    render(<BentoGrid />)
    expect(screen.getByText(/error occurred while loading the dashboard/i)).toBeInTheDocument()
  })

  it('renders the greeting, KPI cards and chart on success', () => {
    liveMock.mockReturnValue(liveResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    // Greeting shows the device id
    expect(screen.getByText('esp32-test')).toBeInTheDocument()

    // One KPI card per configured KPI
    expect(screen.getByText('Humidity')).toBeInTheDocument()
    expect(screen.getByText('Flame')).toBeInTheDocument()
    expect(screen.getAllByText('Temperature').length).toBeGreaterThan(0)

    // The historical chart heading
    expect(screen.getByText('Historical')).toBeInTheDocument()
  })

  it('shows a skeleton in place of the chart while history is loading', () => {
    liveMock.mockReturnValue(liveResult({ data: makeSensor(), isLoading: false, isError: false }))
    historyMock.mockReturnValue(historyResult({ data: undefined, isLoading: true }))
    render(<BentoGrid />)

    // Greeting still renders, but the chart heading does not
    expect(screen.getByText('esp32-test')).toBeInTheDocument()
    expect(screen.queryByText('Historical')).not.toBeInTheDocument()
  })
})
