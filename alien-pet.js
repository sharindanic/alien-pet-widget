// Alien Pet: a tiny pixel alien that lives in your iPhone home screen widget.
// Its mood follows your phone: battery, charging, time of day and how often you pet it.
// Runs in Scriptable (https://scriptable.app).

const DEFAULT_NAME = "Blip"
const SCALE = 8 // screen points per sprite pixel
const HOUR = 60 * 60 * 1000

// ---------- state ----------

const fm = FileManager.local()
const statePath = fm.joinPath(fm.documentsDirectory(), "alien-pet.json")

function loadState() {
  if (fm.fileExists(statePath)) {
    try {
      return JSON.parse(fm.readString(statePath))
    } catch (e) {}
  }
  const now = Date.now()
  return { name: DEFAULT_NAME, born: now, lastFed: now, lastPet: 0 }
}

function saveState(state) {
  fm.writeString(statePath, JSON.stringify(state))
}

// ---------- mood ----------

const MOODS = {
  happy:    { eyes: "open",   mouth: "smile", body: "#7CE35A", glow: "#FFE066", line: "vibing 👽" },
  loved:    { eyes: "happy",  mouth: "smile", body: "#8CF06A", glow: "#FF8FAB", line: "loves you 💚", blush: true },
  eating:   { eyes: "happy",  mouth: "open",  body: "#7CE35A", glow: "#FFE066", line: "eating electrons ⚡️" },
  playing:  { eyes: "happy",  mouth: "open",  body: "#7CE35A", glow: "#FFE066", line: "zoomies! ✨" },
  snacking: { eyes: "happy",  mouth: "open",  body: "#7CE35A", glow: "#FFB347", line: "tasty space snack 🍪" },
  hungry:   { eyes: "open",   mouth: "open",  body: "#B9D85A", glow: "#FFB347", line: "hungry… plug me in 🔌" },
  tired:    { eyes: "droopy", mouth: "sad",   body: "#8FA98A", glow: "#6B6B6B", line: "low battery… so tired" },
  sleeping: { eyes: "closed", mouth: "flat",  body: "#4E9E68", glow: "#7A86FF", line: "zzz… 💤" },
}

const SKINS = {
  classic: { name: "Classic green", body: "#7CE35A", dark: "#4E9E68", background: ["#0E1A12", "#16301E"] },
  pink: { name: "Nebula pink", body: "#F48DC4", dark: "#A96591", background: ["#271327", "#482344"] },
  blue: { name: "Moon blue", body: "#76C8F5", dark: "#527DAA", background: ["#101D32", "#1A3856"] },
}
const ACCESSORIES = { none: "None", crown: "Crown", bow: "Bow" }

function skinFor(state) { return SKINS[state.skin] || SKINS.classic }

function bodyColor(state, moodKey) {
  const skin = skinFor(state)
  return moodKey === "sleeping" || moodKey === "tired" ? skin.dark : skin.body
}

function getMood(state) {
  const hour = new Date().getHours()
  if (Device.isCharging()) return "eating"
  if (hour >= 23 || hour < 6) return "sleeping"
  if (Device.batteryLevel() < 0.2) return "tired"
  if (Date.now() - (state.lastPlayed || 0) < 30 * 60 * 1000) return "playing"
  if (Date.now() - (state.lastSnack || 0) < 30 * 60 * 1000) return "snacking"
  if (Date.now() - state.lastPet < HOUR) return "loved"
  if (Date.now() - state.lastFed > 24 * HOUR) return "hungry"
  return "happy"
}

// ---------- sprite ----------

// D outline, G body, A antenna tip. Eyes and mouth are stamped on per mood.
const BODY = [
  "...A........A...",
  "....D......D....",
  ".....DDDDDD.....",
  "....DGGGGGGD....",
  "...DGGGGGGGGD...",
  "..DGGGGGGGGGGD..",
  "..DGGGGGGGGGGD..",
  "..DGGGGGGGGGGD..",
  "..DGGGGGGGGGGD..",
  "..DGGGGGGGGGGD..",
  "...DGGGGGGGGD...",
  "....DGGGGGGD....",
  "....DGGDDGGD....",
  "...DGGD..DGGD...",
]

// 2x2 per eye, rows 6-7. W white, K pupil.
const EYES = {
  open:   { left: ["WW", "WK"], right: ["WW", "KW"] },
  happy:  { left: ["DD", "GG"], right: ["DD", "GG"] },
  closed: { left: ["GG", "DD"], right: ["GG", "DD"] },
  droopy: { left: ["DD", "WK"], right: ["DD", "KW"] },
}

// 6x2 mouth, rows 9-10. R tongue.
const MOUTHS = {
  smile: ["DGGGGD", "GDDDDG"],
  sad:   ["GDDDDG", "DGGGGD"],
  open:  ["GDDDDG", "GDRRDG"],
  flat:  ["GGGGGG", "GGDDGG"],
}

function drawAlien(mood, state, moodKey) {
  const grid = BODY.map(row => row.split(""))
  const eyes = EYES[mood.eyes]
  const mouth = MOUTHS[mood.mouth]
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      grid[6 + r][4 + c] = eyes.left[r][c]
      grid[6 + r][10 + c] = eyes.right[r][c]
    }
    for (let c = 0; c < 6; c++) grid[9 + r][5 + c] = mouth[r][c]
  }
  if (mood.blush) {
    grid[8][3] = "P"
    grid[8][12] = "P"
  }
  if (state.accessory === "crown") {
    for (const [x, y] of [[6, 1], [8, 0], [10, 1], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]) grid[y][x] = "T"
  } else if (state.accessory === "bow") {
    for (const [x, y] of [[1, 3], [2, 4], [1, 5], [3, 4], [5, 3], [4, 4], [5, 5]]) grid[y][x] = "T"
  }

  const palette = {
    D: "#173B22", G: bodyColor(state, moodKey), A: mood.glow,
    W: "#FFFFFF", K: "#101010", R: "#E8505B", P: "#FF8FAB", T: "#FFE066",
  }
  const ctx = new DrawContext()
  ctx.size = new Size(16 * SCALE, BODY.length * SCALE)
  ctx.opaque = false
  ctx.respectScreenScale = true
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === ".") return
    ctx.setFillColor(new Color(palette[ch]))
    ctx.fillRect(new Rect(x * SCALE, y * SCALE, SCALE, SCALE))
  }))
  return ctx.getImage()
}

function drawEnergyBar(level, color) {
  const ctx = new DrawContext()
  ctx.size = new Size(100, 6)
  ctx.opaque = false
  ctx.respectScreenScale = true
  const track = new Path()
  track.addRoundedRect(new Rect(0, 0, 100, 6), 3, 3)
  ctx.addPath(track)
  ctx.setFillColor(new Color("#FFFFFF", 0.15))
  ctx.fillPath()
  const fill = new Path()
  fill.addRoundedRect(new Rect(0, 0, Math.max(6, 100 * level), 6), 3, 3)
  ctx.addPath(fill)
  ctx.setFillColor(new Color(color))
  ctx.fillPath()
  return ctx.getImage()
}

// ---------- widget ----------

function addInfo(stack, state, mood, moodKey) {
  const battery = Math.round(Device.batteryLevel() * 100)
  const days = Math.floor((Date.now() - state.born) / (24 * HOUR)) + 1

  const name = stack.addText(state.name)
  name.font = Font.boldRoundedSystemFont(14)
  name.textColor = Color.white()

  const line = stack.addText(mood.line)
  line.font = Font.regularRoundedSystemFont(11)
  line.textColor = new Color("#CFE8D2")
  line.lineLimit = 1
  line.minimumScaleFactor = 0.7

  stack.addSpacer(4)
  const bar = stack.addImage(drawEnergyBar(battery / 100, bodyColor(state, moodKey)))
  bar.imageSize = new Size(100, 6)
  stack.addSpacer(3)

  const meta = stack.addText(`⚡️ ${battery}%  ·  day ${days}`)
  meta.font = Font.mediumRoundedSystemFont(10)
  meta.textColor = new Color("#8FB79A")
}

function buildWidget(state, moodKey, family = config.widgetFamily) {
  const mood = MOODS[moodKey]
  const w = new ListWidget()
  const bg = new LinearGradient()
  const skin = skinFor(state)
  bg.colors = moodKey === "sleeping"
    ? [new Color("#0B1030"), new Color("#1C1F4A")]
    : skin.background.map(color => new Color(color))
  bg.locations = [0, 1]
  w.backgroundGradient = bg
  w.setPadding(10, 12, 10, 12)
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  const runUrl = URLScheme.forRunningScript()
  w.url = runUrl + (runUrl.includes("?") ? "&" : "?") + "action=pet"

  const img = drawAlien(mood, state, moodKey)
  if (family === "medium") {
    const row = w.addStack()
    row.centerAlignContent()
    row.addImage(img).imageSize = new Size(110, 96)
    row.addSpacer(14)
    const col = row.addStack()
    col.layoutVertically()
    addInfo(col, state, mood, moodKey)
  } else {
    const top = w.addStack()
    top.addSpacer()
    top.addImage(img).imageSize = new Size(72, 63)
    top.addSpacer()
    w.addSpacer(4)
    addInfo(w, state, mood, moodKey)
  }
  return w
}

async function customize(state) {
  const menu = new Alert()
  menu.title = "Customize your alien"
  menu.addAction("Change color")
  menu.addAction("Change accessory")
  menu.addCancelAction("Back")
  const choice = await menu.presentSheet()
  if (choice < 0) return
  const picker = new Alert()
  picker.title = choice === 0 ? "Alien color" : "Accessory"
  const options = choice === 0 ? SKINS : ACCESSORIES
  const keys = Object.keys(options)
  for (const key of keys) picker.addAction(choice === 0 ? options[key].name : options[key])
  picker.addCancelAction("Cancel")
  const selected = await picker.presentSheet()
  if (selected >= 0) state[choice === 0 ? "skin" : "accessory"] = keys[selected]
}

// ---------- main ----------

const state = loadState()
if (Device.isCharging()) state.lastFed = Date.now()

function interact(action) {
  if (action === "pet") state.lastPet = Date.now()
  if (action === "feed") state.lastSnack = Date.now()
  if (action === "play") state.lastPlayed = Date.now()
}

if (config.runsInWidget) {
  saveState(state)
  Script.setWidget(buildWidget(state, getMood(state)))
} else {
  const quickAction = args.queryParameters && args.queryParameters.action
  let action = ["pet", "feed", "play"].includes(quickAction) ? quickAction : null
  if (!action) {
    const menu = new Alert()
    menu.title = `👽 ${state.name}`
    menu.message = "What do you want to do?"
    for (const label of ["Pet", "Feed snack", "Play", "Rename", "Customize", "Preview widget"]) menu.addAction(label)
    menu.addCancelAction("Close")
    const choice = await menu.presentSheet()
    action = ["pet", "feed", "play", "rename", "customize", "preview"][choice]
  }

  if (["pet", "feed", "play"].includes(action)) {
    interact(action)
  } else if (action === "rename") {
    const ask = new Alert()
    ask.title = "Name your alien"
    ask.addTextField("Name", state.name)
    ask.addAction("Save")
    ask.addCancelAction("Cancel")
    if (await ask.present() === 0) {
      const name = ask.textFieldValue(0).trim()
      if (name) state.name = name.slice(0, 12)
    }
  }
  if (action === "customize") await customize(state)
  saveState(state)

  if (action === "preview") await buildWidget(state, getMood(state), "medium").presentMedium()
  else if (action) await buildWidget(state, getMood(state), "small").presentSmall()
}

Script.complete()
