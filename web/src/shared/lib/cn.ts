import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Склеивает классы и разрешает конфликты Tailwind: последний выигрывает,
// поэтому className из пропсов может переопределить классы компонента.
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}
