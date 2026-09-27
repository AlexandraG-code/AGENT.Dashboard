/**
 * Имя агента для людей. Ключ (`name`) неизменен — по нему зовут через «@» и
 * ведут статистику, а имя (`title`) человек может не задавать вовсе.
 */
export function roleTitle(role: { name: string; title?: string }): string {
	return role.title || role.name
}
