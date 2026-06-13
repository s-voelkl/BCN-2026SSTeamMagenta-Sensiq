import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SensorChart from '../SensorChart'
import type { SensorData, SensorHistory } from '../../types/dashboard'

// Mock recharts so we can inspect the data the chart actually receives
// (recharts renders an SVG that is hard to assert against in jsdom).
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

function makePoint(timestamp: string, dht_temperature: number): SensorData {
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
  }
}

// latest point is at 12:00; earlier points are 2h and 12h before it
const history: SensorHistory = [
  makePoint('2026-01-01T00:00:00Z', 10),
  makePoint('2026-01-01T10:00:00Z', 20),
  makePoint('2026-01-01T12:00:00Z', 30),
]

function readChartValues(): number[] {
  const raw = screen.getByTestId('area-chart').getAttribute('data-points') ?? '[]'
  return (JSON.parse(raw) as { time: string; value: number }[]).map((d) => d.value)
}

describe('SensorChart', () => {
  it('renders the label and the historical heading', () => {
    render(<SensorChart data={history} measure="dht_temperature" label="Temperature" range="1D" />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('Historical')).toBeInTheDocument()
  })

  it('renders a button for every time range', () => {
    render(<SensorChart data={history} measure="dht_temperature" label="Temperature" />)
    for (const label of ['1H', '6H', '1D', '1W', '1M', '1Y']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps only points within a 6H window of the latest sample', () => {
    render(<SensorChart data={history} measure="dht_temperature" label="Temperature" range="6H" />)
    // latest = 12:00, cutoff = 06:00 -> drops the 00:00 point
    expect(readChartValues()).toEqual([20, 30])
  })

  it('keeps only the latest point within a 1H window', () => {
    render(<SensorChart data={history} measure="dht_temperature" label="Temperature" range="1H" />)
    expect(readChartValues()).toEqual([30])
  })

  it('keeps every point within a 1D window', () => {
    render(<SensorChart data={history} measure="dht_temperature" label="Temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30])
  })

  it('maps the selected measure into the chart values', () => {
    render(<SensorChart data={history} measure="dht_humidity" label="Humidity" range="1D" />)
    // all points share dht_humidity = 50
    expect(readChartValues()).toEqual([50, 50, 50])
  })

  it('calls onRangeChange with the clicked range', () => {
    const onRangeChange = vi.fn()
    render(
      <SensorChart
        data={history}
        measure="dht_temperature"
        label="Temperature"
        range="1D"
        onRangeChange={onRangeChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '1W' }))
    expect(onRangeChange).toHaveBeenCalledWith('1W')
  })

  it('highlights the active range button', () => {
    render(<SensorChart data={history} measure="dht_temperature" label="Temperature" range="6H" />)
    expect(screen.getByRole('button', { name: '6H' })).toHaveClass('bg-amber-500')
    expect(screen.getByRole('button', { name: '1H' })).toHaveClass('text-slate-400')
  })
})
