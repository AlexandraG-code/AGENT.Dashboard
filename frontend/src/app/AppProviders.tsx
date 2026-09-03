'use client'

import { AntdRegistry } from '@ant-design/nextjs-registry'
import { App, ConfigProvider, theme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'

import { i18next } from '@/shared/config/i18n'
import { useUiSettings } from '@/shared/model'

/**
 * Провайдеры приложения: SSR-реестр стилей antd, тема, локали и настройки читаемости.
 *
 * @param children — дерево приложения
 */
export function AppProviders({ children }: React.PropsWithChildren) {
	const { fontSize, surface, weight, restore } = useUiSettings()

	useEffect(() => {
		restore()
	}, [restore])

	const light = surface === 'light'

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
							colorPrimary: light ? '#15803d' : '#22c55e',
							colorBgBase: light ? '#f8fafc' : '#0f172a',
							colorLink: light ? '#0369a1' : '#38bdf8',
							borderRadius: 10,
							fontWeightStrong: weight === 'bold' ? 700 : 600
						},
						components: {
							Card: { colorBgContainer: 'transparent' },
							Table: { colorBgContainer: 'transparent' }
						}
					}}
				>
					<App>{children}</App>
				</ConfigProvider>
			</I18nextProvider>
		</AntdRegistry>
	)
}
