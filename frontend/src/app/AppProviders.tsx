'use client'

import { AntdRegistry } from '@ant-design/nextjs-registry'
import { App, ConfigProvider, theme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'

import { i18next } from '@/shared/config/i18n'
import { useUiSettings } from '@/shared/model'
import { NeuralField } from '@/shared/ui'

/**
 * Провайдеры приложения: SSR-реестр стилей antd, тема, локали и настройки читаемости.
 * Здесь же живёт фоновая сетка: она общая для всех маршрутов и не должна
 * перезапускаться при переключении вкладок.
 *
 * @param children — дерево приложения
 */
export function AppProviders({ children }: React.PropsWithChildren) {
	const { fontSize, surface, weight, motion, background, restore } = useUiSettings()

	useEffect(() => {
		restore()
	}, [restore])

	const light = surface === 'light'
	// Сетка берёт цвета из токенов один раз при монтировании, поэтому смена
	// оформления пересоздаёт её через key, а не через слежение за переменными.
	const themeKey = `${surface}-${background?.glow1 ?? 'theme'}`

	return (
		<AntdRegistry>
			<I18nextProvider i18n={i18next}>
				<ConfigProvider
					locale={ruRU}
					theme={{
						algorithm: light ? theme.defaultAlgorithm : theme.darkAlgorithm,
						token: {
							// Кегль тянется из настроек «Вида»: antd считает свои размеры от него.
							fontSize,
							fontFamily: 'var(--font-ui, var(--font-fira-sans)), sans-serif',
							fontFamilyCode: 'var(--font-mono)',
							colorPrimary: light ? '#6d28d9' : '#8b5cf6',
							colorInfo: light ? '#0369a1' : '#38bdf8',
							colorSuccess: light ? '#047857' : '#34d399',
							colorError: light ? '#be123c' : '#fb7185',
							colorBgBase: light ? '#f8fafc' : '#0b101f',
							colorLink: light ? '#0369a1' : '#7dd3fc',
							borderRadius: 11,
							wireframe: false,
							fontWeightStrong: weight === 'bold' ? 700 : 600
						},
						components: {
							Card: { colorBgContainer: 'transparent' },
							// Шапку таблицы задаём сами: с прозрачным фоном контейнера antd
							// выводит её цвет в чёрный, и в светлой теме заголовки пропадают.
							Table: {
								colorBgContainer: 'transparent',
								headerBg: 'var(--surface-2)',
								headerColor: 'var(--text-mute)',
								borderColor: 'var(--line)',
								rowHoverBg: 'var(--surface-3)'
							},
							// Всплывающие поверхности остаются НЕПРОЗРАЧНЫМИ: стекло красиво,
							// но сквозь панель настроек не должно просвечивать содержимое —
							// прочитать её тогда невозможно.
							Tabs: { horizontalItemGutter: 28 }
						}
					}}
				>
					<App>
						<NeuralField key={themeKey} enabled={motion === 'neural'} />
						{children}
					</App>
				</ConfigProvider>
			</I18nextProvider>
		</AntdRegistry>
	)
}
