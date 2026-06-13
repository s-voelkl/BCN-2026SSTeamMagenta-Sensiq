import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Greeting from '../Greeting'

describe('Greeting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the device id', () => {
    // local-constructed date keeps getHours() deterministic across timezones
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0))
    render(<Greeting deviceId="esp32-lab-001" />)
    expect(screen.getByText('esp32-lab-001')).toBeInTheDocument()
  })

  it('renders the current time with an accessible label', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0))
    render(<Greeting deviceId="dev" />)
    expect(screen.getByLabelText('Current time').textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  describe('getGreeting', () => {
    it.each([
      [2, /Good Night/],
      [9, /Good Morning/],
      [14, /Good Afternoon/],
      [20, /Good Evening/],
    ])('shows the right greeting at hour %i', (hour, label) => {
      vi.setSystemTime(new Date(2026, 0, 1, hour, 0, 0))
      render(<Greeting deviceId="dev" />)
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  describe('isWithinFiveMinutes (online indicator)', () => {
    it('marks the device online when the timestamp is within five minutes', () => {
      vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0))
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
      render(<Greeting deviceId="esp32-lab-001" timestamp={oneMinuteAgo} />)
      const badge = screen.getByText('esp32-lab-001')
      expect(badge).toHaveClass('border-emerald-800/60')
      expect(badge).not.toHaveClass('text-red-400')
    })

    it('marks the device offline when the timestamp is older than five minutes', () => {
      vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0))
      const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
      render(<Greeting deviceId="esp32-lab-001" timestamp={tenMinutesAgo} />)
      const badge = screen.getByText('esp32-lab-001')
      expect(badge).toHaveClass('border-red-800/60', 'text-red-400')
    })

    it('treats a missing timestamp as offline', () => {
      vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0))
      render(<Greeting deviceId="esp32-lab-001" />)
      const badge = screen.getByText('esp32-lab-001')
      expect(badge).toHaveClass('border-red-800/60', 'text-red-400')
    })
  })
})
