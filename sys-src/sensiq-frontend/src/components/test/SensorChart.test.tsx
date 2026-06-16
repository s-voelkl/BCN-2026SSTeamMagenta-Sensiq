import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SensorChart from '../SensorChart'
import type { SensorDataHistory } from '../../types/dashboard'

// Mock recharts: it renders an SVG that is hard to assert against in jsdom, so we
// swap AreaChart for a div that exposes the data it received via an attribute.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="area-chart" data-points={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}))

// A complete history row; tests only care about timestamp + the measured values.
function makePoint(timestamp: string, dht_temperature: number): SensorDataHistory {
  return {
    running_time: 1,
    timestamp,
    device_id: 'esp32-lab-001',
    location: 'Lab A',
    dht_humidity: 50,
    dht_temperature,
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
  }
}

// latest point is at 12:00; earlier points are 2h and 12h before it
const history: SensorDataHistory[] = [
  makePoint('2026-01-01T00:00:00Z', 10),
  makePoint('2026-01-01T10:00:00Z', 20),
  makePoint('2026-01-01T12:00:00Z', 30),
]

// Read the `value` of every point the (mocked) chart received, in order.
function readChartValues(): number[] {
  const raw = screen.getByTestId('area-chart').getAttribute('data-points') ?? '[]'
  return (JSON.parse(raw) as { time: number; value: number }[]).map((d) => d.value)
}

describe('SensorChart', () => {
  it('renders the historical heading and defaults the dropdown to the given measure', () => {
    render(<SensorChart data={history} measure="dht_temperature" range="1D" />)
    expect(screen.getByText('Historical')).toBeInTheDocument()
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('dht_temperature')
  })

  // The dropdown is built from MEASURE_META, which excludes the flame sensor.
  it('offers every non-flame measure in the dropdown', () => {
    render(<SensorChart data={history} range="1D" />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toHaveLength(5)
    expect(options).toContain('Temperature (°C)')
    expect(options).toContain('Gases (VOC) (ppb)')
    expect(options.some((o) => /flame/i.test(o ?? ''))).toBe(false)
  })

  it('renders a button for every time range', () => {
    render(<SensorChart data={history} range="1D" />)
    for (const label of ['1H', '6H', '1D', '1W', '1M', '1Y']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps only points within a 6H window of the latest sample', () => {
    render(<SensorChart data={history} measure="dht_temperature" range="6H" />)
    // latest = 12:00, cutoff = 06:00 -> drops the 00:00 point
    expect(readChartValues()).toEqual([20, 30])
  })

  it('keeps only the latest point within a 1H window', () => {
    render(<SensorChart data={history} measure="dht_temperature" range="1H" />)
    expect(readChartValues()).toEqual([30])
  })

  it('keeps every point within a 1D window', () => {
    render(<SensorChart data={history} measure="dht_temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30])
  })

  // The API returns rows newest-first, so the chart must sort ascending — otherwise
  // the line is drawn backwards and the "latest sample" used for filtering is wrong.
  it('sorts points chronologically regardless of input order', () => {
    const unsorted = [
      makePoint('2026-01-01T12:00:00Z', 30),
      makePoint('2026-01-01T00:00:00Z', 10),
      makePoint('2026-01-01T10:00:00Z', 20),
    ]
    render(<SensorChart data={unsorted} measure="dht_temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30])
  })

  it('plots the measure given as the initial selection', () => {
    render(<SensorChart data={history} measure="dht_humidity" range="1D" />)
    // all points share dht_humidity = 50
    expect(readChartValues()).toEqual([50, 50, 50])
  })

  // Changing the dropdown re-plots a different field without any extra wiring.
  it('re-plots the chart when a new measure is selected', () => {
    render(<SensorChart data={history} measure="dht_temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30]) // dht_temperature

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dht_humidity' } })
    expect(readChartValues()).toEqual([50, 50, 50]) // now dht_humidity
  })

  it('calls onRangeChange with the clicked range', () => {
    const onRangeChange = vi.fn()
    render(<SensorChart data={history} range="1D" onRangeChange={onRangeChange} />)
    fireEvent.click(screen.getByRole('button', { name: '1W' }))
    expect(onRangeChange).toHaveBeenCalledWith('1W')
  })

  it('highlights the active range button', () => {
    render(<SensorChart data={history} range="6H" />)
    expect(screen.getByRole('button', { name: '6H' })).toHaveClass('bg-amber-500')
    expect(screen.getByRole('button', { name: '1H' })).toHaveClass('text-slate-400')
  })

  // The chart frame stays mounted in every state and shows an inline message
  // instead of being replaced by a skeleton.
  describe('status overlays', () => {
    it('shows a loading message while loading with no data yet', () => {
      render(<SensorChart data={[]} loading />)
      expect(screen.getByText(/loading data/i)).toBeInTheDocument()
    })

    it('shows a failure message on error', () => {
      render(<SensorChart data={[]} error />)
      expect(screen.getByText(/failed to load data/i)).toBeInTheDocument()
    })

    it('shows an "Updating" hint while refetching with data still on screen', () => {
      render(<SensorChart data={history} fetching />)
      expect(screen.getByText(/updating/i)).toBeInTheDocument()
    })

    it('shows no status overlay in the normal state', () => {
      render(<SensorChart data={history} />)
      expect(screen.queryByText(/loading data/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/failed to load data/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/updating/i)).not.toBeInTheDocument()
    })
  })
})
