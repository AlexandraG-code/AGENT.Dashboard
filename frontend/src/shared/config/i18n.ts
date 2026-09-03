'use client'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from '@/shared/locales/ru.json'

/**
 * Локализация интерфейса. Язык один — русский, но тексты вынесены целиком:
 * строки в разметке невозможно ни найти, ни перевести, ни выправить оптом.
 */
export const defaultLanguage = 'ru'

if (!i18next.isInitialized) {
	void i18next.use(initReactI18next).init({
		resources: { ru: { translation: ru } },
		lng: defaultLanguage,
		fallbackLng: defaultLanguage,
		interpolation: { escapeValue: false }
	})
}

export { i18next }
