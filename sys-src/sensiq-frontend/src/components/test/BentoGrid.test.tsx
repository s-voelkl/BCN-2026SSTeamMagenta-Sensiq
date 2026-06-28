import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent  } from '@testing-library/react'
import type { SensorDataLive, SensorDataHistory } from '../../types/dashboard'


// Mock only the two query hooks; keep ApiError / isDeviceOffline real so BentoGrid's
// offline detection works as in production.
vi.mock('../../hooks/useDashboardData', async (importActual) => {
  const actual = await importActual<typeof import('../../hooks/useDashboardData')>()
  return { ...actual, useLiveData: vi.fn(), useHistoryData: vi.fn() }
})

import { useLiveData, useHistoryData, ApiError } from '../../hooks/useDashboardData'
import BentoGrid from '../BentoGrid'

const liveMock = vi.mocked(useLiveData)
const historyMock = vi.mocked(useHistoryData)

function makeSensor(overrides: Partial<SensorDataLive> = {}): SensorDataLive {
  return {
    timestamp: '2026-05-28T00:43:00Z',
    device_id: 'esp32-test',
    location: 'Lab A',
    flame_analog: 0,
    flame_digital: false,
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

// BentoGrid only reads a few react-query fields, so cast the partial result we pass in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asResult = (r: Record<string, unknown>) => r as any

describe('BentoGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    historyMock.mockReturnValue(
      asResult({ data: history, isLoading: false, isFetching: false, isError: false }),
    )
  })

  // The header (Greeting) must stay visible in every state — it no longer depends on data.
  it('shows a skeleton in each KPI while live data loads, with the header visible', () => {
    liveMock.mockReturnValue(asResult({ data: undefined, isLoading: true, isError: false }))
    render(<BentoGrid />)

    expect(screen.getByText('Sensiq')).toBeInTheDocument() // header
    expect(screen.getAllByTestId('kpi-skeleton')).toHaveLength(6) // one per KPI
  })

  it('shows an "offline" message in each KPI when the device is offline (437)', () => {
    liveMock.mockReturnValue(
      asResult({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError(437, { message: 'Device is offline', last_seen: '2026-06-16T00:11:33Z' }),
      }),
    )
    render(<BentoGrid />)

    expect(screen.getByText('Sensiq')).toBeInTheDocument()
    expect(screen.getAllByText('Device offline').length).toBeGreaterThan(0)
  })

  it('shows a generic error message in each KPI on a non-offline error', () => {
    liveMock.mockReturnValue(
      asResult({ data: undefined, isLoading: false, isError: true, error: new Error('HTTP 500') }),
    )
    render(<BentoGrid />)

    expect(screen.getByText('Sensiq')).toBeInTheDocument()
    expect(screen.getAllByText(/an error occurred/i).length).toBeGreaterThan(0)
  })

  it('renders the greeting, KPI cards and chart on success', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    expect(screen.getByText('esp32-test')).toBeInTheDocument() // greeting device id
    expect(screen.getByText('Humidity')).toBeInTheDocument()
    expect(screen.getByText('Flame')).toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument() // temperature KPI card
    expect(screen.getByText('Historical')).toBeInTheDocument()  // chart heading
  })

  // The chart has its own loading state, independent of the live KPIs.
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
  
  it('calls useLiveData with the default device id on first render', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    expect(liveMock).toHaveBeenCalledWith('esp32-lab-001')
  })

  it('re-renders KPIs with data from the new device after confirming a device id change', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    const input = screen.getByLabelText('Device ID')
    fireEvent.change(input, { target: { value: 'esp32-roof-002' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(liveMock).toHaveBeenLastCalledWith('esp32-roof-002')
  })

  it('does not change the active device id while typing, only after confirming', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    const input = screen.getByLabelText('Device ID')
    fireEvent.change(input, { target: { value: 'esp32-roof-002' } })

    expect(liveMock).toHaveBeenLastCalledWith('esp32-lab-001')
  })

  it('renders the device id input alongside the greeting header', () => {
    liveMock.mockReturnValue(asResult({ data: makeSensor(), isLoading: false, isError: false }))
    render(<BentoGrid />)

    expect(screen.getByLabelText('Device ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })
  
})
