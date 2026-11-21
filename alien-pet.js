// Alien Pet: a tiny pixel alien that lives in your iPhone home screen widget.
// Its mood follows your phone: battery, charging, time of day and how often you pet it.
// Runs in Scriptable (https://scriptable.app).

const DEFAULT_NAME = "Blip"
const SCALE = 8 // screen points per sprite pixel
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const VERSION = "2.0.0"

// ---------- state ----------

const fm = FileManager.local()
const legacyPath = fm.joinPath(fm.documentsDirectory(), "alien-pet.json")
const statePath = fm.joinPath(fm.documentsDirectory(), "alien-pets.json")

function newPet(name = DEFAULT_NAME, id = "blip") {
  const now = Date.now()
  return { id, name, born: now, lastFed: now, lastPet: 0, interactions: 0, journal: [], missionDays: [], streakDays: [] }
}

function readJSON(path) {
  if (!fm.fileExists(path)) return null
  try { return JSON.parse(fm.readString(path)) } catch (error) { return null }
}

function loadCollection() {
  const saved = readJSON(statePath)
  if (saved && Array.isArray(saved.pets) && saved.pets.length) {
    const pets = saved.pets.filter(pet => pet && /^[a-z0-9-]{1,40}$/.test(pet.id) && typeof pet.name === "string")
    if (pets.length) return { version: 2, activeId: saved.activeId, pets }
  }
  // Keep the original file untouched as a recoverable copy during migration.
  const legacy = readJSON(legacyPath)
  const pet = legacy && typeof legacy === "object" && typeof legacy.name === "string"
    ? { ...newPet(), ...legacy, id: "blip" } : newPet()
  return { version: 2, activeId: "blip", pets: [pet] }
}

function saveCollection(collection) {
  fm.writeString(statePath, JSON.stringify(collection))
}

function petById(collection, id) {
  return collection.pets.find(pet => pet.id === id) || collection.pets.find(pet => pet.id === collection.activeId) || collection.pets[0]
}

function uniquePetId(collection, name) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "pet"
  let id = base
  for (let number = 2; collection.pets.some(pet => pet.id === id); number++) id = `${base}-${number}`
  return id
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const MISSIONS = ["pet", "feed", "play"]
function missionFor(state) {
  const today = dayKey()
  const day = Math.floor(new Date(`${today}T12:00:00`).getTime() / DAY)
  const mission = MISSIONS[(day + state.id.length) % MISSIONS.length]
  return { action: mission, label: { pet: "Pet your alien", feed: "Feed a snack", play: "Play together" }[mission], done: (state.missionDays || []).includes(today) }
}

function careStats(state) {
  const age = Math.max(0, Date.now() - (state.lastSnack || state.born))
  const fullness = Math.max(20, Math.round(100 - age / HOUR * 3))
  const affection = Math.max(20, Math.round(100 - Math.max(0, Date.now() - (state.lastPet || state.born)) / HOUR * 2))
  return { fullness, affection, energy: Math.round(Device.batteryLevel() * 100) }
}

function streak(state) {
  const days = new Set(state.streakDays || [])
  const cursor = new Date()
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (days.has(dayKey(cursor))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

function recordInteraction(state, action) {
  const now = Date.now()
  if (action === "pet") state.lastPet = now
  else if (action === "feed") { state.lastSnack = now; state.lastFed = now }
  else if (action === "play") state.lastPlayed = now
  else return
  state.interactions = (state.interactions || 0) + 1
  const today = dayKey()
  state.streakDays = [...new Set([...(state.streakDays || []), today])].slice(-45)
  const mission = missionFor(state)
  const completed = mission.action === action && !mission.done
  if (completed) state.missionDays = [...new Set([...(state.missionDays || []), today])].slice(-90)
  const surprise = completed && (state.missionDays.length % 3 === 0) ? "Found a tiny moon rock!" : null
  state.journal = [...(state.journal || []), { at: now, action, mission: completed, surprise }].slice(-20)
}

function achievements(state) {
  const badges = []
  if ((state.interactions || 0) >= 10) badges.push("First friend")
  if (streak(state) >= 3) badges.push("3-day streak")
  if ((state.missionDays || []).length >= 7) badges.push("Mission master")
  if (growthStage(state) === "captain") badges.push("Captain")
  return badges
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
const ACCESSORIES = { none: "None", crown: "Crown", bow: "Bow", star: "Star (3 missions)" }

function skinFor(state) { return SKINS[state.skin] || SKINS.classic }

function bodyColor(state, moodKey) {
  const skin = skinFor(state)
  if (skin === SKINS.classic) return MOODS[moodKey].body
  return moodKey === "sleeping" || moodKey === "tired" ? skin.dark : skin.body
}

function growthStage(state) {
  const days = Math.floor((Date.now() - state.born) / (24 * HOUR)) + 1
  const interactions = state.interactions || 0
  if (days >= 14 && interactions >= 50) return "captain"
  if (days >= 3 && interactions >= 10) return "explorer"
  return "hatchling"
}

function weatherKind(weather) {
  if (!weather) return null
  const code = weather.code
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow"
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain"
  if (code <= 2 && weather.isDay) return "sun"
  return "cloud"
}

function validWeatherLocation(location) {
  return location &&
    typeof location.latitude === "number" && Number.isFinite(location.latitude) &&
    typeof location.longitude === "number" && Number.isFinite(location.longitude) &&
    location.latitude >= -90 && location.latitude <= 90 &&
    location.longitude >= -180 && location.longitude <= 180
}

async function currentWeather(state) {
  if (!state.weatherEnabled || !validWeatherLocation(state.weatherLocation)) return null
  const cached = state.weather
  if (cached && Date.now() - cached.updated < HOUR) return cached
  if (state.weatherAttempted && Date.now() - state.weatherAttempted < HOUR) {
    return cached && Date.now() - cached.updated < 3 * HOUR ? cached : null
  }
  state.weatherAttempted = Date.now()
  const location = state.weatherLocation
  const latitude = Math.round(location.latitude * 100) / 100
  const longitude = Math.round(location.longitude * 100) / 100
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,is_day&forecast_days=1`
  try {
    const request = new Request(url)
    request.timeoutInterval = 8
    request.onRedirect = redirected => redirected.url.startsWith("https://api.open-meteo.com/") ? redirected : null
    const response = await request.loadJSON()
    if (!response.current || !Number.isFinite(response.current.weather_code)) throw new Error("Weather unavailable")
    state.weather = { code: response.current.weather_code, isDay: response.current.is_day === 1, updated: Date.now() }
    return state.weather
  } catch (error) {
    return cached && Date.now() - cached.updated < 3 * HOUR ? cached : null
  }
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

function drawAlien(mood, state, moodKey, weather) {
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
  const stage = growthStage(state)
  if (stage === "explorer" || stage === "captain") {
    grid[4][5] = "X"
    grid[4][10] = "X"
  }
  if (stage === "captain") {
    grid[5][4] = "X"
    grid[5][11] = "X"
    grid[0][0] = "A"
    grid[1][1] = "A"
  }
  const weatherType = weatherKind(weather)
  if (weatherType === "sun" && moodKey !== "sleeping") {
    for (const x of [4, 5, 10, 11]) grid[6][x] = "K"
    for (const x of [4, 5, 10, 11]) grid[7][x] = "K"
    for (const x of [6, 7, 8, 9]) grid[6][x] = "D"
  } else if (weatherType === "rain") {
    for (let x = 0; x <= 5; x++) grid[0][x] = "U"
    grid[1][2] = "D"
    grid[2][2] = "D"
    grid[3][2] = "D"
  } else if (weatherType === "snow") {
    grid[3][0] = "W"
    grid[7][15] = "W"
    grid[11][0] = "W"
  }
  if (state.accessory === "crown") {
    for (const [x, y] of [[6, 1], [8, 0], [10, 1], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]) grid[y][x] = "T"
  } else if (state.accessory === "bow") {
    for (const [x, y] of [[1, 3], [2, 4], [1, 5], [3, 4], [5, 3], [4, 4], [5, 5]]) grid[y][x] = "T"
  } else if (state.accessory === "star") {
    for (const [x, y] of [[8, 0], [7, 1], [8, 1], [9, 1], [8, 2], [2, 2]]) grid[y][x] = "T"
  }

  const palette = {
    D: "#173B22", G: bodyColor(state, moodKey), A: mood.glow,
    W: "#FFFFFF", K: "#101010", R: "#E8505B", P: "#FF8FAB", T: "#FFE066", X: "#FFF3B0", U: "#B28DFF",
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

function addInfo(stack, state, mood, moodKey, weather) {
  const battery = Math.round(Device.batteryLevel() * 100)
  const days = Math.floor((Date.now() - state.born) / (24 * HOUR)) + 1

  const name = stack.addText(state.name)
  name.font = Font.boldRoundedSystemFont(14)
  name.textColor = Color.white()

  const weatherIcon = { sun: "☀️", rain: "☔️", snow: "❄️", cloud: "☁️" }[weatherKind(weather)] || ""
  const line = stack.addText(`${mood.line} ${weatherIcon}`.trim())
  line.font = Font.regularRoundedSystemFont(11)
  line.textColor = new Color("#CFE8D2")
  line.lineLimit = 1
  line.minimumScaleFactor = 0.7

  stack.addSpacer(4)
  const bar = stack.addImage(drawEnergyBar(battery / 100, bodyColor(state, moodKey)))
  bar.imageSize = new Size(100, 6)
  stack.addSpacer(3)

  const meta = stack.addText(`⚡️ ${battery}% · day ${days} · ${growthStage(state)}`)
  meta.font = Font.mediumRoundedSystemFont(10)
  meta.textColor = new Color("#8FB79A")
  meta.lineLimit = 1
  meta.minimumScaleFactor = 0.7

  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const updated = stack.addText(`updated ${time}`)
  updated.font = Font.regularRoundedSystemFont(8)
  updated.textColor = new Color("#70957B")
}

function addCareLine(stack, state, size = 10) {
  const care = careStats(state)
  const mission = missionFor(state)
  const line = stack.addText(`💚 ${care.affection}%  🍪 ${care.fullness}%  ⚡ ${care.energy}%`)
  line.font = Font.mediumRoundedSystemFont(size)
  line.textColor = new Color("#CFE8D2")
  line.lineLimit = 1
  line.minimumScaleFactor = 0.65
  const task = stack.addText(`${mission.done ? "✓" : "○"} ${mission.label} · 🔥 ${streak(state)}`)
  task.font = Font.regularRoundedSystemFont(size)
  task.textColor = new Color("#CFE8D2")
  task.lineLimit = 1
  task.minimumScaleFactor = 0.65
}

function addHabitat(widget, state, moodKey, weather) {
  const heading = widget.addText(`✦ ${state.name}'s little universe`)
  heading.font = Font.boldRoundedSystemFont(16)
  heading.textColor = Color.white()
  widget.addSpacer(8)
  const scene = widget.addStack()
  scene.centerAlignContent()
  scene.addSpacer()
  scene.addImage(drawAlien(MOODS[moodKey], state, moodKey, weather)).imageSize = new Size(144, 126)
  scene.addSpacer()
  widget.addSpacer(8)
  const status = widget.addText(`${MOODS[moodKey].line} · day ${Math.floor((Date.now() - state.born) / DAY) + 1} · ${growthStage(state)}`)
  status.font = Font.mediumRoundedSystemFont(12)
  status.textColor = new Color("#CFE8D2")
  addCareLine(widget, state, 11)
  const progress = growthStage(state) === "captain" ? "Captain unlocked!" :
    growthStage(state) === "explorer" ? `${state.interactions || 0}/50 interactions toward Captain` :
      `${state.interactions || 0}/10 interactions toward Explorer`
  const growth = widget.addText(progress)
  growth.font = Font.regularRoundedSystemFont(10)
  growth.textColor = new Color("#8FB79A")
  const badges = achievements(state)
  if (badges.length) {
    const badgeLine = widget.addText(`🏅 ${badges.join(" · ")}`)
    badgeLine.font = Font.regularRoundedSystemFont(10)
    badgeLine.textColor = new Color("#FFE066")
    badgeLine.lineLimit = 1
    badgeLine.minimumScaleFactor = 0.7
  }
  const latest = (state.journal || []).slice(-1)[0]
  if (latest) {
    const history = widget.addText(latest.surprise || `Last care: ${latest.action}${latest.mission ? " · mission complete!" : ""}`)
    history.font = Font.regularRoundedSystemFont(10)
    history.textColor = new Color("#8FB79A")
  }
}

function petURL(state) {
  const runUrl = URLScheme.forRunningScript()
  return runUrl + (runUrl.includes("?") ? "&" : "?") + `action=pet&pet=${encodeURIComponent(state.id)}`
}

function buildWidget(state, moodKey, weather, family = config.widgetFamily) {
  if (family && family.startsWith("accessory")) return buildLockWidget(state, moodKey, weather, family)
  const mood = MOODS[moodKey]
  const w = new ListWidget()
  const bg = new LinearGradient()
  const skin = skinFor(state)
  bg.colors = moodKey === "sleeping" || (weather && !weather.isDay)
    ? [new Color("#0B1030"), new Color("#1C1F4A")]
    : skin.background.map(color => new Color(color))
  bg.locations = [0, 1]
  w.backgroundGradient = bg
  w.setPadding(10, 12, 10, 12)
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  w.url = petURL(state)

  const img = drawAlien(mood, state, moodKey, weather)
  if (family === "large") {
    addHabitat(w, state, moodKey, weather)
  } else if (family === "medium") {
    const row = w.addStack()
    row.centerAlignContent()
    row.addImage(img).imageSize = new Size(110, 96)
    row.addSpacer(14)
    const col = row.addStack()
    col.layoutVertically()
    addInfo(col, state, mood, moodKey, weather)
  } else {
    const top = w.addStack()
    top.addSpacer()
    top.addImage(img).imageSize = new Size(72, 63)
    top.addSpacer()
    w.addSpacer(4)
    addInfo(w, state, mood, moodKey, weather)
  }
  return w
}

function buildLockWidget(state, moodKey, weather, family) {
  const w = new ListWidget()
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  w.addAccessoryWidgetBackground = family !== "accessoryInline"
  w.url = petURL(state)
  const battery = Math.round(Device.batteryLevel() * 100)
  if (family === "accessoryInline") {
    w.addText(`👽 ${state.name.slice(0, 6)} · 🔥${streak(state)} · ${battery}%`)
    return w
  }

  const img = drawAlien(MOODS[moodKey], state, moodKey, weather)
  if (family === "accessoryCircular") {
    w.setPadding(1, 2, 1, 2)
    const face = w.addImage(img)
    face.imageSize = new Size(41, 36)
    face.centerAlignImage()
    const level = w.addText(`${battery}%`)
    level.font = Font.boldRoundedSystemFont(10)
    level.centerAlignText()
  } else {
    w.setPadding(2, 5, 2, 5)
    const row = w.addStack()
    row.centerAlignContent()
    row.addImage(img).imageSize = new Size(46, 40)
    row.addSpacer(4)
    const details = row.addStack()
    details.layoutVertically()
    const name = details.addText(state.name)
    name.font = Font.boldRoundedSystemFont(12)
    const mission = missionFor(state)
    const level = details.addText(`${mission.done ? "✓" : "○"} ${mission.label} · 🔥${streak(state)}`)
    level.font = Font.regularRoundedSystemFont(9)
    level.lineLimit = 1
    level.minimumScaleFactor = 0.7
  }
  return w
}

async function previewWidget(state, weather) {
  const picker = new Alert()
  picker.title = "Preview widget"
  for (const label of ["Home Screen small", "Home Screen medium", "Home Screen large habitat", "Lock Screen circle", "Lock Screen rectangle", "Lock Screen inline"]) picker.addAction(label)
  picker.addCancelAction("Back")
  const choice = await picker.presentSheet()
  const family = ["small", "medium", "large", "accessoryCircular", "accessoryRectangular", "accessoryInline"][choice]
  if (!family) return
  const widget = buildWidget(state, getMood(state), weather, family)
  if (family === "small") await widget.presentSmall()
  else if (family === "medium") await widget.presentMedium()
  else if (family === "large") await widget.presentLarge()
  else if (family === "accessoryCircular") await widget.presentAccessoryCircular()
  else if (family === "accessoryRectangular") await widget.presentAccessoryRectangular()
  else await widget.presentAccessoryInline()
}

async function configureWeather(state) {
  if (state.weatherEnabled) {
    const prompt = new Alert()
    prompt.title = "Weather is on"
    prompt.addAction("Update location")
    prompt.addDestructiveAction("Turn off weather")
    prompt.addCancelAction("Back")
    const choice = await prompt.presentSheet()
    if (choice === 1) {
      state.weatherEnabled = false
      delete state.weatherLocation
      delete state.weather
      delete state.weatherAttempted
      return
    }
    if (choice !== 0) return
  } else {
    const disclosure = new Alert()
    disclosure.title = "Enable weather?"
    disclosure.message = "Scriptable will ask for your location. The alien saves approximate coordinates and sends them to Open-Meteo for weather. Open-Meteo may keep request logs for up to 90 days. You can turn this off and delete the saved location later."
    disclosure.addAction("Enable weather")
    disclosure.addCancelAction("Keep off")
    if (await disclosure.present() !== 0) return
  }
  try {
    Location.setAccuracyToKilometer()
    const location = await Location.current()
    if (!validWeatherLocation(location)) throw new Error("Invalid location")
    state.weatherLocation = {
      latitude: Math.round(location.latitude * 100) / 100,
      longitude: Math.round(location.longitude * 100) / 100,
    }
    state.weatherEnabled = true
    delete state.weather
    delete state.weatherAttempted
  } catch (error) {
    const alert = new Alert()
    alert.title = "Location unavailable"
    alert.message = "Allow location for Scriptable in iPhone Settings, then try again."
    alert.addAction("OK")
    await alert.present()
  }
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
  const keys = Object.keys(options).filter(key => choice === 0 || key !== "star" || (state.missionDays || []).length >= 3)
  for (const key of keys) picker.addAction(choice === 0 ? options[key].name : options[key])
  picker.addCancelAction("Cancel")
  const selected = await picker.presentSheet()
  if (selected >= 0) state[choice === 0 ? "skin" : "accessory"] = keys[selected]
}

async function managePets(collection) {
  const menu = new Alert()
  menu.title = "Your aliens"
  for (const pet of collection.pets) menu.addAction(`${pet.id === collection.activeId ? "✓ " : ""}${pet.name} · ${pet.id}`)
  menu.addAction("Adopt a new alien")
  menu.addCancelAction("Back")
  const choice = await menu.presentSheet()
  if (choice < 0) return
  if (choice < collection.pets.length) {
    collection.activeId = collection.pets[choice].id
    return
  }
  const ask = new Alert()
  ask.title = "Name your new alien"
  ask.addTextField("Name", "Nova")
  ask.addAction("Adopt")
  ask.addCancelAction("Cancel")
  if (await ask.present() !== 0) return
  const name = ask.textFieldValue(0).trim().slice(0, 12)
  if (!name) return
  const pet = newPet(name, uniquePetId(collection, name))
  collection.pets.push(pet)
  collection.activeId = pet.id
}

async function showJournal(state) {
  const alert = new Alert()
  alert.title = `${state.name}'s care journal`
  const entries = (state.journal || []).slice(-8).reverse().map(entry =>
    `${dayKey(new Date(entry.at))}: ${entry.action}${entry.mission ? " ✓ mission" : ""}${entry.surprise ? ` · ${entry.surprise}` : ""}`)
  alert.message = [
    `Streak: ${streak(state)} day(s) · missions: ${(state.missionDays || []).length}`,
    `Badges: ${achievements(state).join(", ") || "none yet"}`,
    ...entries,
  ].join("\n")
  alert.addAction("OK")
  await alert.present()
}

async function showTips(collection) {
  const alert = new Alert()
  alert.title = `Alien Pet ${VERSION}`
  alert.message = `For a specific Lock Screen pet, edit the Scriptable widget and enter its ID in Parameter: ${collection.pets.map(pet => `${pet.name} = ${pet.id}`).join(", ")}. The rectangular widget shows today's mission; tap it to pet. Feed and Play are in this menu. iOS chooses when widgets refresh.`
  alert.addAction("OK")
  await alert.present()
}

// ---------- main ----------

const collection = loadCollection()
const requestedId = config.runsInWidget ? (args.widgetParameter || "").trim() :
  args.queryParameters && args.queryParameters.action === "pet" ? args.queryParameters.pet : null
let state = petById(collection, requestedId)
if (Device.isCharging()) state.lastFed = Date.now()

if (config.runsInWidget) {
  const weather = await currentWeather(state)
  saveCollection(collection)
  Script.setWidget(buildWidget(state, getMood(state), weather))
} else {
  const quickAction = args.queryParameters && args.queryParameters.action
  // Only widget petting can run without opening the in-app menu.
  let action = quickAction === "pet" ? "pet" : null
  if (!action) {
    const menu = new Alert()
    menu.title = `👽 ${state.name}`
    menu.message = "What do you want to do?"
    for (const label of ["Pet", "Feed snack", "Play", "Rename", "Customize", "Weather", "Preview widget", "Your aliens", "Care journal", "Widget tips"]) menu.addAction(label)
    menu.addCancelAction("Close")
    const choice = await menu.presentSheet()
    action = ["pet", "feed", "play", "rename", "customize", "weather", "preview", "pets", "journal", "tips"][choice]
  }

  if (["pet", "feed", "play"].includes(action)) {
    recordInteraction(state, action)
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
  if (action === "weather") await configureWeather(state)
  if (action === "pets") { await managePets(collection); state = petById(collection, collection.activeId) }
  if (action === "journal") await showJournal(state)
  if (action === "tips") await showTips(collection)
  const weather = await currentWeather(state)
  saveCollection(collection)

  if (action === "preview") await previewWidget(state, weather)
  else if (["pet", "feed", "play", "rename", "customize", "weather", "pets"].includes(action))
    await buildWidget(state, getMood(state), weather, "small").presentSmall()
}

Script.complete()
