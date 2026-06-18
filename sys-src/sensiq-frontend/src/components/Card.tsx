import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

interface CardProps {
  children: ReactNode
  className?: string
}

/** Reusable card wrapper that gives its children the standard rounded, bordered panel look. */
export default function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm',
        'transition-colors duration-200 hover:border-slate-700',
        className,
      )}
    >
      {children}
    </div>
  )
}
