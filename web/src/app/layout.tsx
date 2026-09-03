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
			<head>
				{/* Настройки читаемости применяются до первой отрисовки, иначе страница
				    мигает стандартным видом, а при слабом зрении это неприятно вдвойне. */}
				<script
					dangerouslySetInnerHTML={{
						__html: `try{var s=JSON.parse(localStorage.getItem('fleet-ui')||'{}');var r=document.documentElement;
r.style.fontSize=(s.fontSize||17)+'px';r.dataset.weight=s.weight||'medium';r.dataset.contrast=s.contrast||'high';
r.dataset.surface=s.surface||'glass';r.dataset.font=s.font||'fira';}catch(e){}`
					}}
				/>
			</head>
			<body className="font-sans antialiased">{children}</body>
		</html>
	)
}
