// Reuse the widget's drawing code so the README illustration matches its pixel art.
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const source = fs.readFileSync(path.join(root, "alien-pet.js"), "utf8")
const drawingCode = source.split("// ---------- main ----------")[0]

class Color { constructor(hex) { this.hex = hex } }
class Size { constructor(width, height) { this.width = width; this.height = height } }
class Rect { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }) } }
class DrawContext {
  constructor() { this.pixels = [] }
  setFillColor(color) { this.color = color.hex }
  fillRect(rect) { this.pixels.push({ ...rect, color: this.color }) }
  getImage() { return this.pixels }
}

const { drawAlien, MOODS, SKINS } = new Function(
  "Color", "Size", "Rect", "DrawContext", "FileManager",
  `${drawingCode}\nreturn { drawAlien, MOODS, SKINS }`,
)(Color, Size, Rect, DrawContext, { local: () => ({ documentsDirectory: () => "", joinPath: () => "" }) })

function escape(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")
}

function sprite(state) {
  const pixels = drawAlien(MOODS.happy, state, "happy", null)
  const byColor = new Map()
  for (const { x, y, width, height, color } of pixels) {
    const segments = byColor.get(color) || []
    segments.push(`M${x} ${y}h${width}v${height}h-${width}z`)
    byColor.set(color, segments)
  }
  return [...byColor].map(([color, segments]) => `<path fill="${color}" d="${segments.join("")}"/>`).join("")
}

const variants = [
  { skin: "classic", accessory: "none", name: "Classic green", detail: "Original Blip" },
  { skin: "pink", accessory: "bow", name: "Nebula pink", detail: "Bow accessory" },
  { skin: "blue", accessory: "crown", name: "Moon blue", detail: "Crown accessory" },
]

const cards = variants.map((variant, index) => {
  const x = 30 + index * 290
  const { background, body } = SKINS[variant.skin]
  return `<defs><linearGradient id="bg${index}" x2="1" y2="1"><stop stop-color="${background[0]}"/><stop offset="1" stop-color="${background[1]}"/></linearGradient></defs>
  <rect x="${x}" y="52" width="260" height="288" rx="23" fill="url(#bg${index})" stroke="#FFFFFF" stroke-opacity=".12"/>
  <g transform="translate(${x + 66} 77)">${sprite({ skin: variant.skin, accessory: variant.accessory, born: Date.now(), interactions: 0 })}</g>
  <text x="${x + 22}" y="224" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="21" font-weight="700">Blip</text>
  <text x="${x + 22}" y="247" fill="#D7E4DB" font-family="Arial,sans-serif" font-size="14">vibing 👽</text>
  <rect x="${x + 22}" y="264" width="154" height="7" rx="4" fill="#FFFFFF" fill-opacity=".17"/>
  <rect x="${x + 22}" y="264" width="123" height="7" rx="4" fill="${body}"/>
  <text x="${x + 22}" y="292" fill="#B9CBBE" font-family="Arial,sans-serif" font-size="12">⚡ 80% · day 1 · hatchling</text>
  <text x="${x + 22}" y="318" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="15" font-weight="700">${escape(variant.name)}</text>
  <text x="${x + 237}" y="318" fill="#B9CBBE" text-anchor="end" font-family="Arial,sans-serif" font-size="11">${escape(variant.detail)}</text>`
}).join("\n")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="370" viewBox="0 0 900 370" role="img" aria-label="Illustrated previews of Classic green, Nebula pink with bow, and Moon blue with crown">
<rect width="900" height="370" fill="#09130E"/>
<text x="30" y="31" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="20" font-weight="700">Make your alien yours</text>
${cards}
<text x="30" y="360" fill="#8EAA97" font-family="Arial,sans-serif" font-size="11">Illustrated preview generated from the widget sprite; actual iPhone appearance may vary.</text>
</svg>\n`

fs.writeFileSync(path.join(root, "assets", "customizations.svg"), svg)
