import { pickReadableTextColor, resolveThemeColors } from './theme-colors'

// Minimal shape of what sigma's hover-drawing function actually reads —
// looser than sigma's own (unexported) `NodeHoverDrawingFunction` type so
// this file doesn't need to reach into sigma's internal declaration paths.
export interface HoverDrawData {
  x: number
  y: number
  size: number
  label?: string | null
}
export interface HoverDrawSettings {
  labelSize: number
  labelFont: string
  labelWeight: string
}

/**
 * Themed replacement for sigma's built-in `drawDiscNodeHover`
 * (`sigma/dist/index-*.esm.js`), which hardcodes the hover box to a fixed
 * white fill (`context.fillStyle = "#FFF"`) — fine with black text in light
 * mode, but the previous canvas already forced light node-label text for
 * dark-mode legibility, so hovering a node in dark mode drew that same
 * light text on the ALWAYS-white hover box: invisible. This mirrors the
 * original's exact box geometry (pill for wide labels, disc otherwise) but
 * fills it with the current theme's card color and picks its own text color
 * against THAT fill, so hover stays readable in both themes independent of
 * the canvas-background label color used elsewhere.
 */
export function drawThemedNodeHover(
  context: CanvasRenderingContext2D,
  data: HoverDrawData,
  settings: HoverDrawSettings,
  isDark: boolean,
): void {
  const size = settings.labelSize
  const font = settings.labelFont
  const weight = settings.labelWeight
  context.font = `${weight} ${String(size)}px ${font}`

  const theme = resolveThemeColors(isDark)
  const boxColor = theme.card
  const textColor = pickReadableTextColor(boxColor)

  context.fillStyle = boxColor
  context.strokeStyle = theme.border
  context.lineWidth = 1
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 8
  context.shadowColor = isDark ? '#000000' : 'rgba(15, 23, 42, 0.35)'

  const PADDING = 2
  if (typeof data.label === 'string') {
    const textWidth = context.measureText(data.label).width
    const boxWidth = Math.round(textWidth + 5)
    const boxHeight = Math.round(size + 2 * PADDING)
    const radius = Math.max(data.size, size / 2) + PADDING
    const angleRadian = Math.asin(boxHeight / 2 / radius)
    const xDeltaCoord = Math.sqrt(Math.abs(Math.pow(radius, 2) - Math.pow(boxHeight / 2, 2)))
    context.beginPath()
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2)
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2)
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian)
    context.closePath()
    context.fill()
    context.stroke()
  } else {
    context.beginPath()
    context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2)
    context.closePath()
    context.fill()
    context.stroke()
  }
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 0

  if (data.label) {
    context.fillStyle = textColor
    context.fillText(data.label, data.x + data.size + 3, data.y + size / 3)
  }
}
