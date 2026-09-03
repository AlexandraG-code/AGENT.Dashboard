import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'

import './globals.css'

const firaSans = Fira_Sans({
	subsets: ['latin', 'cyrillic'],
	weight: ['300', '400', '500', '600'],
	variable: '--font-fira-sans'
})

const firaCode = Fira_Code({
	subsets: ['latin', 'cyrillic'],
	weight: ['400', '500', '600'],
	variable: '--font-fira-code'
})

export const metadata: Metadata = {
	title: 'AGENT.Dashboard',
	description: 'Центр управления флотом ИИ-агентов: расходы, вызовы, роли и контекст проектов'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="ru" className={`${firaSans.variable} ${firaCode.variable}`}>
			<body className="font-sans antialiased">{children}</body>
		</html>
	)
}
