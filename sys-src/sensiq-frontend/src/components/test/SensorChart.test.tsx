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
  Area: ({ dataKey, stroke, fill }: { dataKey: string; stroke?: string; fill?: string }) => (
    <div data-testid="area" data-key={dataKey} data-stroke={stroke} data-fill={fill} />
  ),
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}))

// A complete history row; tests only care about timestamp + the measured values.
function makePoint(timestamp: string, bme_temperature: number): SensorDataHistory {
  return {
    running_time: 1,
    timestamp,
    device_id: 'esp32-lab-001',
    location: 'Lab A',
    dht_humidity: 50,
    dht_temperature: 22,
    dht_heat_index: 24,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2000,
    thermistor_digital: false,
    thermistor_temp: 24,
    bme_heated_up: true,
    bme_temperature,
    bme_humidity: 50,
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

function readChartPoints(): {
    time: number
    value: number
    level: 'normal' | 'critical'
    normalValue: number | null
    criticalValue: number | null
    warningValue?: number | null
}[] {
    const raw = screen.getByTestId('area-chart').getAttribute('data-points') ?? '[]'
    return JSON.parse(raw)
}

describe('SensorChart', () => {
  it('renders the historical heading and defaults the dropdown to the given measure', () => {
    render(<SensorChart data={history} measure="bme_temperature" range="1D" />)
    expect(screen.getByText('Historical')).toBeInTheDocument()
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('bme_temperature')
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
    render(<SensorChart data={history} measure="bme_temperature" range="6H" />)
    // latest = 12:00, cutoff = 06:00 -> drops the 00:00 point
    expect(readChartValues()).toEqual([20, 30])
  })

  it('keeps only the latest point within a 1H window', () => {
    render(<SensorChart data={history} measure="bme_temperature" range="1H" />)
    expect(readChartValues()).toEqual([30])
  })

  it('keeps every point within a 1D window', () => {
    render(<SensorChart data={history} measure="bme_temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30])
  })

  it('splits temperature points into normal and critical threshold values', () => {
    const thresholdHistory = [
      makePoint('2026-01-01T10:00:00Z', 24),
      makePoint('2026-01-01T11:00:00Z', 9),
      makePoint('2026-01-01T11:00:00Z', 35),
      makePoint('2026-01-01T12:00:00Z', 36),
    ]

    render(<SensorChart data={thresholdHistory} measure="bme_temperature" range="1D" />)

    const points = readChartPoints()

    expect(points[0]).toMatchObject({
      value: 24,
      level: 'normal',
      normalValue: 24,
      criticalValue: null,
    })

    expect(points[1]).toMatchObject({
      value: 9,
      level: 'critical',
      normalValue: 9,
      criticalValue: 9,
    })

    expect(points[2]).toMatchObject({
      value: 35,
      level: 'normal',
      normalValue: 35,
      criticalValue: 35,
    })

    expect(points[3]).toMatchObject({
      value: 36,
      level: 'critical',
      normalValue: 36,
      criticalValue: 36,
    })
  })

  it('splits humidity points into normal and critical threshold values', () => {
    const thresholdHistory = [
      {
        ...makePoint('2026-01-01T10:00:00Z', 24),
        bme_humidity: 50,
      },
      {
        ...makePoint('2026-01-01T11:00:00Z', 24),
        bme_humidity: 19,
      },
      {
        ...makePoint('2026-01-01T11:00:00Z', 24),
        bme_humidity: 81,
      },
    ]

    render(<SensorChart data={thresholdHistory} measure="bme_humidity" range="1D" />)

    const points = readChartPoints()

    expect(points[0]).toMatchObject({
      value: 50,
      level: 'normal',
      normalValue: 50,
      criticalValue: null,
    })

    expect(points[1]).toMatchObject({
      value: 19,
      level: 'critical',
      normalValue: 19,
      criticalValue: 19,
    })

    expect(points[2]).toMatchObject({
      value: 81,
      level: 'critical',
      normalValue: null,
      criticalValue: 81,
    })
  })

  it('splits pressure points into normal and critical threshold values', () => {
    const thresholdHistory = [
      {
        ...makePoint('2026-01-01T10:00:00Z', 24),
        bme_pressure: 1000,
      },
      {
        ...makePoint('2026-01-01T11:00:00Z', 24),
        bme_pressure: 899,
      },
      {
        ...makePoint('2026-01-01T11:00:00Z', 24),
        bme_pressure: 1101,
      },
    ]

    render(<SensorChart data={thresholdHistory} measure="bme_pressure" range="1D" />)

    const points = readChartPoints()

    expect(points[0]).toMatchObject({
      value: 1000,
      level: 'normal',
      normalValue: 1000,
      criticalValue: null,
    })

    expect(points[1]).toMatchObject({
      value: 899,
      level: 'critical',
      normalValue: 899,
      criticalValue: 899,
    })

    expect(points[2]).toMatchObject({
      value: 1101,
      level: 'critical',
      normalValue: null,
      criticalValue: 1101,
    })
  })

  it('splits VOC points into normal and critical threshold values', () => {
    const thresholdHistory = [
      {
        ...makePoint('2026-01-01T10:00:00Z', 24),
        bme_voc: 250,
      },
      {
        ...makePoint('2026-01-01T11:00:00Z', 24),
        bme_voc: 251,
      },
    ]

    render(<SensorChart data={thresholdHistory} measure="bme_voc" range="1D" />)

    const points = readChartPoints()

    expect(points[0]).toMatchObject({
      value: 250,
      level: 'normal',
      normalValue: 250,
      criticalValue: null,
    })

    expect(points[1]).toMatchObject({
      value: 251,
      level: 'critical',
      normalValue: 251,
      criticalValue: 251,
    })
  })

  it('splits light intensity points into normal and critical threshold values', () => {
    const thresholdHistory = [
      {
        ...makePoint('2026-01-01T10:00:00Z', 24),
        tsl_lux: 1000,
      },
      {
        ...makePoint('2026-01-01T11:00:00Z', 24),
        tsl_lux: 1001,
      },
    ]

    render(<SensorChart data={thresholdHistory} measure="tsl_lux" range="1D" />)

    const points = readChartPoints()

    expect(points[0]).toMatchObject({
      value: 1000,
      level: 'normal',
      normalValue: 1000,
      criticalValue: null,
    })

    expect(points[1]).toMatchObject({
      value: 1001,
      level: 'critical',
      normalValue: 1001,
      criticalValue: 1001,
    })
  })

  it('renders separate areas for normal and critical threshold segments', () => {
    render(<SensorChart data={history} measure="bme_temperature" range="1D" />)

    const areas = screen.getAllByTestId('area')

    expect(areas).toHaveLength(2)

    expect(areas[0]).toHaveAttribute('data-key', 'normalValue')
    expect(areas[0]).toHaveAttribute('data-stroke', '#2abe9b')

    expect(areas[1]).toHaveAttribute('data-key', 'criticalValue')
    expect(areas[1]).toHaveAttribute('data-stroke', '#EF4444')
    })

  it('does not create a warning threshold series', () => {
    render(<SensorChart data={history} measure="bme_temperature" range="1D" />)

    const points = readChartPoints()
    const areas = screen.getAllByTestId('area')

    expect(points.some(point => 'warningValue' in point)).toBe(false)
    expect(areas.some(area => area.getAttribute('data-key') === 'warningValue')).toBe(false)
    })

  // the line is drawn backwards and the "latest sample" used for filtering is wrong.
  it('sorts points chronologically regardless of input order', () => {
    const unsorted = [
      makePoint('2026-01-01T12:00:00Z', 30),
      makePoint('2026-01-01T00:00:00Z', 10),
      makePoint('2026-01-01T10:00:00Z', 20),
    ]
    render(<SensorChart data={unsorted} measure="bme_temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30])
  })

  it('plots the measure given as the initial selection', () => {
    render(<SensorChart data={history} measure="bme_humidity" range="1D" />)
    // all points share dht_humidity = 50
    expect(readChartValues()).toEqual([50, 50, 50])
  })

  // Changing the dropdown re-plots a different field without any extra wiring.
  it('re-plots the chart when a new measure is selected', () => {
    render(<SensorChart data={history} measure="bme_temperature" range="1D" />)
    expect(readChartValues()).toEqual([10, 20, 30]) // dht_temperature

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bme_humidity' } })
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
