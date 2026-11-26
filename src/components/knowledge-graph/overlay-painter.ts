/**
 * Draws what WebGL nodes cannot: hidden-neighbor badges, the selection ring, shape-validity rings
 * and the traveling path reveal (OVERSTORY-APPS-R030.10.3, .6, R030.12.3, .4).
 *
 * It paints on one 2D canvas above the renderer and decides nothing; every value arrives from the
 * scene. A ring differs by line style and a text status is given in the details table, so color is
 * never the only channel.
 */
import { RING_STYLES, type ShapeVerdict } from '@/lib/graph-overlays'

export interface PaintNode {
  x: number
  y: number
  size: number
  alpha: number
}

export interface PaintScene {
  /** Viewport position and radius of a node, or null when it is off screen or gone. */
  place: (id: string) => PaintNode | null
  badges: ReadonlyMap<string, number>
  selected: string | null
  rings: ReadonlyMap<string, ShapeVerdict> | null
  /** Path steps with progress 0..1 each. */
  path: { steps: readonly { source: string; target: string }[]; progress: readonly number[] } | null
  accent: string
  badgeFill: string
  badgeText: string
  ringColors: Record<ShapeVerdict, string>
}

export const BADGE_MIN_ALPHA = 0.3

export function badgeText(count: number): string {
  return `+${count > 99 ? '99+' : String(count)}`
}

export function paintOverlay(ctx: CanvasRenderingContext2D, scene: PaintScene, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height)

  if (scene.rings) {
    for (const [id, verdict] of scene.rings) {
      const p = scene.place(id)
      if (!p || p.alpha < BADGE_MIN_ALPHA) continue
      const style = RING_STYLES[verdict]
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.strokeStyle = scene.ringColors[verdict]
      ctx.lineWidth = style.width
      ctx.setLineDash([...style.dash])
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size + 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (scene.path) {
    ctx.save()
    ctx.strokeStyle = scene.accent
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    scene.path.steps.forEach((step, i) => {
      const a = scene.place(step.source)
      const b = scene.place(step.target)
      const t = scene.path?.progress[i] ?? 0
      if (!a || !b || t <= 0) return
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      ctx.stroke()
      if (t < 1) {
        ctx.fillStyle = scene.accent
        ctx.beginPath()
        ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 5, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    ctx.restore()
  }

  if (scene.selected) {
    const p = scene.place(scene.selected)
    if (p) {
      ctx.save()
      ctx.strokeStyle = scene.accent
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size + 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [id, count] of scene.badges) {
    if (count <= 0) continue
    const p = scene.place(id)
    if (!p || p.alpha < BADGE_MIN_ALPHA) continue
    const text = badgeText(count)
    const w = ctx.measureText(text).width + 8
    const x = p.x + p.size * 0.7
    const y = p.y - p.size * 0.7
    ctx.save()
    ctx.globalAlpha = p.alpha
    ctx.fillStyle = scene.badgeFill
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 7, w, 14, 7)
    ctx.fill()
    ctx.fillStyle = scene.badgeText
    ctx.fillText(text, x, y + 0.5)
    ctx.restore()
  }
}
