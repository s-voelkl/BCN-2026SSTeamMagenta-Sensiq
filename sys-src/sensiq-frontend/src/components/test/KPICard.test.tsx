import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KPICard from '../KPICard'
import type { KPI, SensorDataLive } from '../../types/dashboard'

// A complete live reading; each test overrides just the field it cares about.
function makeSensor(overrides: Partial<SensorDataLive> = {}): SensorDataLive {
  return {
    timestamp: '2026-05-28T00:43:00Z',
    device_id: 'esp32-lab-001',
    location: 'Lab A',
    bme_humidity: 51,
    bme_temperature: 25.11111,
    flame_analog: 12,
    flame_digital: false,
    thermistor_temp: 24.5484,
    bme_pressure: 964,
    bme_altitude: 411,
    bme_voc: 215,
    tsl_lux: 361,
    ...overrides,
  }
}

const tempKpi: KPI = { id: '1', label: 'Temperature', unit: '°C', measure: 'bme_temperature' }
const humidityKpi: KPI = { id: '2', label: 'Humidity', unit: '%', measure: 'bme_humidity' }
const flameKpi: KPI = { id: '3', label: 'Flame', unit: '', measure: 'flame_digital' }

describe('KPICard', () => {
  it('renders the KPI label', () => {
    render(<KPICard kpi={tempKpi} data={makeSensor()} />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
  })

  // Value and unit now live in two separate elements, so we check them individually.
  it('rounds a decimal temperature to two places and shows the unit (transformDecimal)', () => {
    render(<KPICard kpi={tempKpi} data={makeSensor({ bme_temperature: 25.11111 })} />)
    expect(screen.getByText('25.11')).toBeInTheDocument()
    expect(screen.getByText('°C')).toBeInTheDocument()
  })

  it('drops trailing zeros produced by rounding', () => {
    // 25.999 -> toFixed(2) "26.00" -> parseFloat -> 26
    render(<KPICard kpi={tempKpi} data={makeSensor({ bme_temperature: 25.999 })} />)
    expect(screen.getByText('26')).toBeInTheDocument()
  })

  // Non-temperature measures are truncated to an integer (transformInteger).
  it('truncates a non-temperature measure to an integer and shows the unit', () => {
    render(<KPICard kpi={humidityKpi} data={makeSensor({ bme_humidity: 51.8 })} />)
    expect(screen.getByText('51')).toBeInTheDocument()
    expect(screen.getByText('%')).toBeInTheDocument()
  })

  it('shows "Negative" for a flame value of false (transformFlame)', () => {
    render(<KPICard kpi={flameKpi} data={makeSensor({ flame_digital: false })} />)
    const value = screen.getByText('Negative')
    expect(value).toBeInTheDocument()
    expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' }) // #2abe9b green
  })

  it('shows "Positive" for a flame value of true (transformFlame)', () => {
    render(<KPICard kpi={flameKpi} data={makeSensor({ flame_digital: true })} />)
    const value = screen.getByText('Positive')
    expect(value).toBeInTheDocument()
    expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' }) // #EF4444 red
  })

  // The flame KPI has an empty unit, so only the label + value <p> should render
  // (no third unit element).
  it('does not render a unit element when the KPI unit is empty', () => {
    const { container } = render(<KPICard kpi={flameKpi} data={makeSensor()} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  // Per-KPI states so one failing live request doesn't blank the whole dashboard.
  describe('non-data states', () => {
    it('shows a skeleton (and no value) while loading', () => {
      render(<KPICard kpi={tempKpi} loading />)
      expect(screen.getByTestId('kpi-skeleton')).toBeInTheDocument()
      expect(screen.queryByText('°C')).not.toBeInTheDocument()
    })

    it('shows an offline message when the device is offline', () => {
      render(<KPICard kpi={tempKpi} offline />)
      expect(screen.getByText('No data')).toBeInTheDocument()
      expect(screen.getByText('Device offline')).toBeInTheDocument()
    })

    it('shows a generic error message on a non-offline error', () => {
      render(<KPICard kpi={tempKpi} error />)
      expect(screen.getByText(/an error occurred/i)).toBeInTheDocument()
    })

    it('falls back to the error message when no data is provided', () => {
      render(<KPICard kpi={tempKpi} />)
      expect(screen.getByText('Unavailable')).toBeInTheDocument()
    })

    it('shows normal color for a temperature inside the threshold range', () => {
      render(
        <KPICard
          kpi={{ id: '1', label: 'Temperature', unit: ' °C', measure: 'bme_temperature' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            bme_temperature: 24,
          } as any}
        />
      )

      const value = screen.getByText('24')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' })
    })

    it('shows critical color for a temperature above the threshold range', () => {
      render(
        <KPICard
          kpi={{ id: '1', label: 'Temperature', unit: ' °C', measure: 'bme_temperature' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            bme_temperature: 36,
          } as any}
        />
      )

      const value = screen.getByText('36')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows critical color for a temperature below the threshold range', () => {
      render(
        <KPICard
          kpi={{ id: '1', label: 'Temperature', unit: ' °C', measure: 'bme_temperature' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            bme_temperature: 9,
          } as any}
        />
      )

      const value = screen.getByText('9')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows normal color for humidity inside the threshold range', () => {
      render(
        <KPICard
          kpi={{ id: '2', label: 'Humidity', unit: '%', measure: 'bme_humidity' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            bme_humidity: 50,
          } as any}
        />
      )

      const value = screen.getByText('50')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' })
    })

    it('shows critical color for humidity outside the threshold range', () => {
      render(
        <KPICard
          kpi={{ id: '2', label: 'Humidity', unit: '%', measure: 'bme_humidity' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            bme_humidity: 81,
          } as any}
        />
      )

      const value = screen.getByText('81')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows critical color for humidity below the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '2', label: 'Humidity', unit: '%', measure: 'bme_humidity' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  bme_humidity: 19,
              } as any}
          />
      )

      const value = screen.getByText('19')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows normal color for pressure inside the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '5', label: 'Pressure', unit: ' hPa', measure: 'bme_pressure' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  bme_pressure: 1000,
              } as any}
          />
      )

      const value = screen.getByText('1000')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' })
    })

    it('shows critical color for pressure above the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '5', label: 'Pressure', unit: ' hPa', measure: 'bme_pressure' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  bme_pressure: 1101,
              } as any}
          />
      )

      const value = screen.getByText('1101')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows critical color for pressure below the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '5', label: 'Pressure', unit: ' hPa', measure: 'bme_pressure' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  bme_pressure: 899,
              } as any}
          />
      )

      const value = screen.getByText('899')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows normal color for VOC inside the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '6', label: 'Gases', unit: ' ppb', measure: 'bme_voc' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  bme_voc: 250,
              } as any}
          />
      )

      const value = screen.getByText('250')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' })
    })

    it('shows critical color for VOC above the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '6', label: 'Gases', unit: ' ppb', measure: 'bme_voc' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  bme_voc: 251,
              } as any}
          />
      )

      const value = screen.getByText('251')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows normal color for light intensity inside the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '4', label: 'Light Intensity', unit: ' lux', measure: 'tsl_lux' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  tsl_lux: 1000,
              } as any}
          />
      )

      const value = screen.getByText('1000')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' })
    })

    it('shows critical color for light intensity above the threshold range', () => {
      render(
          <KPICard
              kpi={{ id: '4', label: 'Light Intensity', unit: ' lux', measure: 'tsl_lux' }}
              data={{
                  device_id: 'esp32-lab-001',
                  timestamp: '2026-06-20T12:00:00Z',
                  tsl_lux: 1001,
              } as any}
          />
      )

      const value = screen.getByText('1001')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

    it('shows normal color for a flame value of false', () => {
      render(
        <KPICard
          kpi={{ id: '3', label: 'Flame', unit: '', measure: 'flame_digital' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            flame_digital: false,
          } as any}
        />
      )

      const value = screen.getByText('Negative')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' })
    })

    it('shows critical color for a flame value of true', () => {
      render(
        <KPICard
          kpi={{ id: '3', label: 'Flame', unit: '', measure: 'flame_digital' }}
          data={{
            device_id: 'esp32-lab-001',
            timestamp: '2026-06-20T12:00:00Z',
            flame_digital: true,
          } as any}
        />
      )

      const value = screen.getByText('Positive')
      expect(value).toBeInTheDocument()
      expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' })
    })

  })
})
