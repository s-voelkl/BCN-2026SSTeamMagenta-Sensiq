import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KPICard from '../KPICard'
import type { KPI, SensorData } from '../../types/dashboard'

function makeSensor(overrides: Partial<SensorData> = {}): SensorData {
  return {
    running_time: 1,
    timestamp: '2026-05-28T00:43:00Z',
    device_id: 'esp32-lab-001',
    location: 'Lab A',
    dht_humidity: 51,
    dht_temperature: 25.11111,
    dht_heat_index: 24.99697,
    flame_analog: 0,
    flame_digital: false,
    thermistor_analog: 2027,
    thermistor_digital: false,
    thermistor_temp: 24.5484,
    ...overrides,
  }
}

const tempKpi: KPI = { id: '1', label: 'Temperature', unit: '°C', measure: 'dht_temperature' }
const humidityKpi: KPI = { id: '2', label: 'Humidity', unit: '%', measure: 'dht_humidity' }
const flameKpi: KPI = { id: '3', label: 'Flame', unit: '', measure: 'flame_analog' }

describe('KPICard', () => {
  it('renders the KPI label', () => {
    render(<KPICard kpi={tempKpi} data={makeSensor()} />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
  })

  it('rounds a decimal measure to two places and appends the unit (transformDecimal)', () => {
    render(<KPICard kpi={tempKpi} data={makeSensor({ dht_temperature: 25.11111 })} />)
    expect(screen.getByText('25.11°C')).toBeInTheDocument()
  })

  it('drops trailing zeros produced by rounding', () => {
    // 25.999 -> toFixed(2) "26.00" -> parseFloat -> 26
    render(<KPICard kpi={tempKpi} data={makeSensor({ dht_temperature: 25.999 })} />)
    expect(screen.getByText('26°C')).toBeInTheDocument()
  })

  it('renders an integer measure unchanged with its unit', () => {
    render(<KPICard kpi={humidityKpi} data={makeSensor({ dht_humidity: 51 })} />)
    expect(screen.getByText('51%')).toBeInTheDocument()
  })

  it('shows "Negative" for a flame value of 0 (transformFlame)', () => {
    render(<KPICard kpi={flameKpi} data={makeSensor({ flame_analog: 0 })} />)
    const value = screen.getByText('Negative')
    expect(value).toBeInTheDocument()
    expect(value).toHaveStyle({ color: 'rgb(42, 190, 155)' }) // #2abe9b green
  })

  it('shows "Positive" for a non-zero flame value (transformFlame)', () => {
    render(<KPICard kpi={flameKpi} data={makeSensor({ flame_analog: 1 })} />)
    const value = screen.getByText('Positive')
    expect(value).toBeInTheDocument()
    expect(value).toHaveStyle({ color: 'rgb(239, 68, 68)' }) // #EF4444 red
  })
})
