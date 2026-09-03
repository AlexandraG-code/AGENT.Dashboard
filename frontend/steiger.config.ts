import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

// Слой pages в FSD здесь не заводится намеренно: его роль играют маршруты
// Next App Router в src/app — они тонкие и только собирают виджеты.
export default defineConfig([
	...fsd.configs.recommended,
	{
		ignores: ['**/*.d.ts', 'src/shared/api/schema.ts']
	},
	{
		files: ['src/app/**'],
		rules: {
			'fsd/no-segmentless-slices': 'off',
			'fsd/no-public-api-sidestep': 'off'
		}
	}
])
