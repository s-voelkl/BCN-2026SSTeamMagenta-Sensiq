import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Card from '../Card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Hello world</Card>)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('applies the base card styling', () => {
    render(<Card>content</Card>)
    const card = screen.getByText('content')
    expect(card).toHaveClass('rounded-2xl', 'border', 'bg-slate-900/80')
  })

  it('merges a custom className with the base classes', () => {
    render(<Card className="custom-class h-full">content</Card>)
    const card = screen.getByText('content')
    expect(card).toHaveClass('custom-class', 'h-full')
    // base classes are still present alongside the custom ones
    expect(card).toHaveClass('rounded-2xl')
  })
})
