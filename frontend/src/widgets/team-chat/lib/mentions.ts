// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.
// файл: frontend/src/widgets/team-chat/lib/mentions.ts

/**
 * Возвращает набранную часть упоминания без @ или null.
 *
 * Почему такие правила: @ внутри слова или после непробельного символа — это
 * почтовый адрес или часть идентификатора, а не попытка кого-то позвать.
 * Пробел между @ и курсором означает, что пользователь уже ушёл писать дальше,
 * и подсказка в этот момент будет только мешать. Пустая строка — валидный
 * результат: пользователь только что набрал @ и ждёт весь список.
 */
export function mentionQuery(text: string, caret: number): string | null {
	const before = text.slice(0, caret)
	const at = before.lastIndexOf('@')
	if (at === -1) return null

	const prevChar = at > 0 ? before[at - 1] : undefined
	if (prevChar !== undefined && prevChar !== ' ' && prevChar !== '\n') return null

	const typed = before.slice(at + 1)
	if (/[\s\n]/.test(typed)) return null

	return typed
}

/**
 * Фильтрует роли по началу названия без учёта регистра.
 *
 * Почему максимум восемь: длинный выпадающий список в чате неудобно
 * просматривать и он перекрывает историю; в команде ролей мало,
 * а при совпадении первых букв пользователь уточнит запрос.
 * Пустой запрос возвращает все роли — сразу после @ нужно показать выбор целиком.
 */
export function matchRoles(roles: string[], query: string): string[] {
	const q = query.toLowerCase()
	const matched = q === '' ? roles : roles.filter((r) => r.toLowerCase().startsWith(q))
	return matched.slice(0, 8)
}

/**
 * Подставляет выбранную роль вместо набранного упоминания.
 *
 * Почему хвост заменяется целиком: после курсора может идти уже набранный
 * текст, и затирать его нельзя — меняем только кусок между @ и курсором.
 * Пробел после роли нужен, чтобы следующее слово не слиплось с упоминанием.
 * Если упоминания в позиции нет (например, список открылся по устаревшему
 * состоянию), безопаснее ничего не менять, чем вставить текст не туда.
 */
export function applyMention(text: string, caret: number, role: string): { text: string; caret: number } {
	const query = mentionQuery(text, caret)
	if (query === null) return { text, caret }

	const at = text.slice(0, caret).lastIndexOf('@')
	const replacement = `@${role} `
	const nextText = `${text.slice(0, at)}${replacement}${text.slice(caret)}`
	const nextCaret = at + replacement.length

	return { text: nextText, caret: nextCaret }
}
