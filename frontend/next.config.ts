import type { NextConfig } from 'next'

// Фронт в разработке живёт на 3000, API флота — на 8770.
// Проксируем /api через Next, чтобы в браузере не было ни CORS, ни хардкода порта.
const API = process.env.FLEET_API ?? 'http://127.0.0.1:8770'

const nextConfig: NextConfig = {
	async rewrites() {
		return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]
	}
}

export default nextConfig
