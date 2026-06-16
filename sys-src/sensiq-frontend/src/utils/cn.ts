import { clsx, type ClassValue } from 'clsx'

/**
 * Combine class names into a single string, dropping falsy values.
 *
 * Thin wrapper around clsx that accepts strings, arrays, and conditional
 * objects (e.g. `{ active: isActive }`). Note: it only concatenates and does
 * not de-duplicate conflicting Tailwind utilities.
 *
 * @example cn('btn', isActive && 'btn-active', { disabled }) // "btn btn-active"
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
