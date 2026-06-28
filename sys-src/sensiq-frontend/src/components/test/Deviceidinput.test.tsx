import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DeviceIdInput from '../DeviceIdInput'

describe('DeviceIdInput', () => {
  // The input field should be pre-filled with the currently active device ID on first render.
  it('renders the input pre-filled with the current device id', () => {
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement
    expect(input.value).toBe('esp32-lab-001')
  })

  // A "Connect" button must always be present to allow the user to confirm their input.
  it('renders a "Connect" button', () => {
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })

   // Typing updates only local state — the parent must not be notified until the user confirms.
  it('updates the input value as the user types, without calling onSubmit', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'esp32-lab-002' } })

    expect(input.value).toBe('esp32-lab-002')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // On submission the value is trimmed before being passed to the parent to avoid accidental whitespace.
  it('calls onSubmit with the trimmed new id when the form is submitted', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: '  esp32-lab-002  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('esp32-lab-002')
  })

  // Submitting a whitespace-only value must be a no-op to prevent empty device ID requests.
  it('does not call onSubmit when the trimmed input is empty', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  // The Connect button is disabled when the field is empty so the user cannot submit an invalid ID.
  it('disables the Connect button while the input is empty', () => {
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()
  })

    // The button becomes clickable again as soon as the user types a non-empty value.
  it('re-enables the Connect button once a non-empty value is typed', () => {
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()

    fireEvent.change(input, { target: { value: 'esp32-lab-003' } })
    expect(screen.getByRole('button', { name: 'Connect' })).not.toBeDisabled()
  })

   // Pressing Enter with only whitespace in the field must not trigger a submission.
  it('does not submit when pressing Enter with an empty (whitespace-only) value', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  // The form can also be submitted via Enter, not only by clicking the button.
  it('submits via pressing Enter inside the form, not just clicking the button', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'esp32-roof-099' } })
    fireEvent.submit(input.closest('form')!)

    expect(onSubmit).toHaveBeenCalledWith('esp32-roof-099')
  })

   // After a successful submit the field retains the new value so the user can see what is active.
  it('keeps showing the typed value even after a successful submit (no auto-clear)', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'esp32-lab-002' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(input.value).toBe('esp32-lab-002')
  })

  // Re-rendering with the same prop must not overwrite what the user has already typed.
  it('does not reset the typed value if currentDeviceId prop stays the same across rerenders', () => {
    const { rerender } = render(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'esp32-lab-999' } })
    rerender(<DeviceIdInput currentDeviceId="esp32-lab-001" onSubmit={vi.fn()} />)

    expect(input.value).toBe('esp32-lab-999')
  })

   // Device IDs containing hyphens and numbers must be passed through unchanged.
  it('submits a device id containing hyphens and numbers unchanged (aside from trimming)', () => {
    const onSubmit = vi.fn()
    render(<DeviceIdInput currentDeviceId="" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Device ID') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'esp32-roof-007' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(onSubmit).toHaveBeenCalledWith('esp32-roof-007')
  })
})