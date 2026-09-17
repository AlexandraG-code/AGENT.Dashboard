/**
 * Знак команды: сфера из узлов и связей, по которым бегут импульсы.
 *
 * Тот же язык, что у фоновой сетки (`neuralMesh`), но точки лежат не в объёме, а
 * НА поверхности шара — так силуэт остаётся круглым и читается даже размером со
 * строку заголовка. Узлы раскладываются по спирали Фибоначчи: случайные точки на
 * сфере сбиваются в комки, а спираль даёт ровную сетку без просветов.
 *
 * Канвас, а не CSS: тонкие линии на сфере в 34 пикселя должны быть чёткими,
 * а трансформации CSS дают мыло и не умеют прятать дальние рёбра.
 */

interface IPoint {
	x: number
	y: number
	z: number
}

interface IEdge {
	from: number
	to: number
	phase: number
	speed: number
}

export interface IGlobeOptions {
	accent: string
	glow: string
	/** false — сфера рисуется одним кадром и замирает (prefers-reduced-motion). */
	animate: boolean
}

const POINTS = 54
const NEIGHBOURS = 2
const FOV = 3.4

function sphere(count: number): IPoint[] {
	// Золотой угол: соседние точки спирали расходятся на несоизмеримую долю оборота,
	// поэтому витки никогда не совпадают и покрытие получается равномерным.
	const golden = Math.PI * (3 - Math.sqrt(5))
	return Array.from({ length: count }, (_, i) => {
		const y = 1 - (i / (count - 1)) * 2
		const radius = Math.sqrt(Math.max(0, 1 - y * y))
		const angle = golden * i
		return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius }
	})
}

function web(points: IPoint[]): IEdge[] {
	const edges: IEdge[] = []
	const seen = new Set<string>()
	points.forEach((point, i) => {
		const nearest = points
			.map((other, j) => ({ j, d: (other.x - point.x) ** 2 + (other.y - point.y) ** 2 + (other.z - point.z) ** 2 }))
			.filter((item) => item.j !== i)
			.sort((a, b) => a.d - b.d)
			.slice(0, NEIGHBOURS)
		for (const { j } of nearest) {
			const key = i < j ? `${i}-${j}` : `${j}-${i}`
			if (seen.has(key)) continue
			seen.add(key)
			edges.push({ from: i, to: j, phase: Math.random(), speed: 0.0002 + Math.random() * 0.0004 })
		}
	})
	return edges
}

/**
 * Запускает анимацию знака в переданном канвасе. Возвращает функцию остановки.
 */
export function startNeuralGlobe(canvas: HTMLCanvasElement, options: IGlobeOptions): () => void {
	const context = canvas.getContext('2d')
	if (!context) return () => {}

	const points = sphere(POINTS)
	const edges = web(points)
	let size = 0
	let radius = 0
	let frame = 0
	let last = performance.now()
	let angle = 0

	const resize = () => {
		const ratio = Math.min(window.devicePixelRatio || 1, 3)
		size = canvas.clientWidth
		radius = size * 0.38
		canvas.width = Math.round(size * ratio)
		canvas.height = Math.round(size * ratio)
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
	}

	const draw = (elapsed: number) => {
		context.clearRect(0, 0, size, size)
		const c = size / 2
		const cos = Math.cos(angle)
		const sin = Math.sin(angle)
		// Наклон оси: без него сфера выглядит плоским кругом, потому что верхний
		// и нижний полюса совпадают с центром.
		const tiltCos = Math.cos(0.38)
		const tiltSin = Math.sin(0.38)

		// Атмосфера: мягкое свечение внутри силуэта, чтобы знак не был дырой.
		const halo = context.createRadialGradient(c - radius * 0.3, c - radius * 0.35, 1, c, c, radius * 1.25)
		halo.addColorStop(0, options.accent)
		halo.addColorStop(1, 'transparent')
		context.globalAlpha = 0.28
		context.fillStyle = halo
		context.beginPath()
		context.arc(c, c, radius * 1.18, 0, Math.PI * 2)
		context.fill()

		const flat = points.map((point) => {
			const x = point.x * cos - point.z * sin
			const zRotated = point.x * sin + point.z * cos
			const y = point.y * tiltCos - zRotated * tiltSin
			const depth = point.y * tiltSin + zRotated * tiltCos
			const scale = FOV / (FOV + depth)
			return { x: c + x * radius * scale, y: c + y * radius * scale, scale, front: depth < 0 }
		})

		context.lineWidth = 0.8
		for (const edge of edges) {
			const a = flat[edge.from]
			const b = flat[edge.to]
			const depth = (a.scale + b.scale) / 2
			context.strokeStyle = options.accent
			// Дальняя половина сферы бледнее: так видно, что это шар, а не круг.
			context.globalAlpha = Math.max(0.05, (depth - 0.78) * 2.6)
			context.beginPath()
			context.moveTo(a.x, a.y)
			context.lineTo(b.x, b.y)
			context.stroke()

			edge.phase += edge.speed * elapsed
			if (edge.phase > 1) edge.phase -= 1
			if (a.front || b.front) {
				const t = edge.phase
				context.globalAlpha = Math.max(0, Math.sin(t * Math.PI)) * 0.9
				context.fillStyle = options.glow
				context.beginPath()
				context.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.9, 0, Math.PI * 2)
				context.fill()
			}
		}

		for (const point of flat) {
			context.globalAlpha = Math.max(0.12, (point.scale - 0.78) * 2.8)
			context.fillStyle = point.front ? options.glow : options.accent
			context.beginPath()
			context.arc(point.x, point.y, 1.1 * point.scale, 0, Math.PI * 2)
			context.fill()
		}
		context.globalAlpha = 1
	}

	const step = (now: number) => {
		const elapsed = Math.min(now - last, 60)
		last = now
		angle += elapsed * 0.00022
		draw(elapsed)
		frame = requestAnimationFrame(step)
	}

	resize()
	window.addEventListener('resize', resize)
	if (options.animate) frame = requestAnimationFrame(step)
	else draw(0)

	return () => {
		cancelAnimationFrame(frame)
		window.removeEventListener('resize', resize)
	}
}
