import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

// Слой pages в FSD здесь не заводится намеренно: его роль играют маршруты
// Next App Router в src/app — они тонкие и только собирают виджеты.
export default defineConfig([
	...fsd.configs.recommended,
	{
		// scss-партиалы — не слайс и публичного API им не нужно;
		// сгенерированную схему API проверять тоже незачем.
		ignores: ['**/*.d.ts', 'src/shared/api/schema.ts', 'src/shared/styles/**', 'src/shared/locales/**']
	},
	{
		files: ['src/app/**'],
		rules: {
			'fsd/no-segmentless-slices': 'off',
			'fsd/no-public-api-sidestep': 'off'
		}
	},
	{
		// Фичи здесь режутся не ради переиспользования между виджетами, а ради
		// границы одного законченного действия (создать агента, тегнуть агента
		// в чате) — единственный потребитель слайса это не ошибка, а сама суть.
		files: ['src/features/**'],
		rules: {
			'fsd/insignificant-slice': 'off'
		}
	}
])
