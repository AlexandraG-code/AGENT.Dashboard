/**
 * Дополнительные заголовки провайдера в виде текста «Ключ: значение» по строке.
 *
 * Так их правит человек: отдельного редактора пар antd не предлагает, а
 * заголовков у провайдера один-два. Ими живут те, кому мало ключа: Yandex Cloud
 * требует `x-folder-id`, без него он не отдаёт ни каталог, ни ответ.
 */
export function headersToText(headers: Record<string, string>): string {
	return Object.entries(headers)
		.map(([name, value]) => `${name}: ${value}`)
		.join('\n')
}

export function textToHeaders(text: string): Record<string, string> {
	const pairs = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && line.includes(':'))
		.map((line) => {
			const at = line.indexOf(':')
			return [line.slice(0, at).trim(), line.slice(at + 1).trim()] as const
		})
		.filter(([name]) => name !== '')
	return Object.fromEntries(pairs)
}
