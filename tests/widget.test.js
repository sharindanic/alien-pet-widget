const { test } = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const source = readFileSync(join(__dirname, "..", "alien-pet.js"), "utf8")
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function node() {
  return {
    children: [],
    addStack() { const item = node(); this.children.push(item); return item },
    addText(value) { const item = node(); item.text = value; this.children.push(item); return item },
    addImage(value) { const item = node(); item.image = value; this.children.push(item); return item },
    addSpacer() {}, setPadding() {}, centerAlignContent() {}, layoutVertically() {}, centerAlignImage() {}, centerAlignText() {},
    async presentSmall() {}, async presentMedium() {}, async presentAccessoryCircular() {},
    async presentAccessoryRectangular() {}, async presentAccessoryInline() {},
  }
}

function environment(saved, { family = "small", inWidget = true, query = {}, choices = [], requestFails = false } = {}) {
  const output = { saved, widget: null, requests: 0 }
  const fileManager = {
    documentsDirectory: () => "/docs",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: () => Boolean(output.saved),
    readString: () => JSON.stringify(output.saved),
    writeString: (_, data) => { output.saved = JSON.parse(data) },
  }
  class DrawContext {
    setFillColor() {} fillRect() {} addPath() {} fillPath() {}
    getImage() { return { drawn: true } }
  }
  class Path { addRoundedRect() {} }
  class Alert {
    constructor() { this.actions = [] }
    addAction(label) { this.actions.push(label) }
    addDestructiveAction(label) { this.actions.push(label) }
    addCancelAction() {}
    addTextField() {}
    textFieldValue() { return "Nova" }
    async presentSheet() { return choices.shift() ?? -1 }
    async present() { return choices.shift() ?? 0 }
  }
  class Request {
    constructor(url) { output.url = url }
    async loadJSON() {
      output.requests++
      if (requestFails) throw new Error("offline")
      return { current: { weather_code: 61, is_day: 1 } }
    }
  }
  const Font = Object.fromEntries(["boldRoundedSystemFont", "regularRoundedSystemFont", "mediumRoundedSystemFont"].map(key => [key, () => key]))
  const globals = {
    FileManager: { local: () => fileManager }, DrawContext, Path, Alert, Request, Font,
    Size: class { constructor(width, height) { Object.assign(this, { width, height }) } },
    Rect: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }) } },
    Color: class { static white() { return new this("white") } },
    LinearGradient: class {}, ListWidget: class { constructor() { return node() } },
    Device: { isCharging: () => false, batteryLevel: () => 0.8 },
    Location: { setAccuracyToKilometer() {}, current: async () => ({ latitude: 6.9271, longitude: 79.8612 }) },
    URLScheme: { forRunningScript: () => "scriptable:///run/Alien%20Pet" },
    Script: { setWidget(widget) { output.widget = widget }, complete() {} },
    config: { runsInWidget: inWidget, widgetFamily: family },
    args: { queryParameters: query },
  }
  output.run = () => new AsyncFunction(...Object.keys(globals), source)(...Object.values(globals))
  return output
}

function allText(item) {
  return [item.text, ...(item.children || []).flatMap(allText)].filter(Boolean)
}

test("Home Screen widget renders and offers direct pet action", async () => {
  const env = environment(null)
  await env.run()
  assert.match(env.widget.url, /action=pet$/)
  assert.ok(allText(env.widget).some(text => text.startsWith("updated ")))
  assert.equal(env.saved.name, "Blip")
})

test("all Lock Screen families render with the saved pet", async () => {
  for (const family of ["accessoryCircular", "accessoryRectangular", "accessoryInline"]) {
    const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0, skin: "blue", accessory: "crown" }, { family })
    await env.run()
    assert.ok(env.widget)
    assert.match(env.widget.url, /action=pet$/)
  }
})

test("pet action updates existing state without resetting its birthday", async () => {
  const born = Date.now() - 10 * 86400000
  const env = environment({ name: "Nova", born, lastFed: born, lastPet: 0 }, { inWidget: false, query: { action: "pet" } })
  await env.run()
  assert.equal(env.saved.born, born)
  assert.equal(env.saved.interactions, 1)
  assert.ok(env.saved.lastPet > 0)
})

test("weather uses its cache and renders even when the network is not needed", async () => {
  const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: 6.93, longitude: 79.86 },
    weather: { code: 61, isDay: true, updated: Date.now() } })
  await env.run()
  assert.equal(env.requests, 0)
  assert.ok(allText(env.widget).some(text => text.includes("☔️")))
})

test("weather is enabled from the iPhone menu and stores an approximate location", async () => {
  const env = environment(null, { inWidget: false, choices: [5] })
  await env.run()
  assert.equal(env.saved.weatherEnabled, true)
  assert.deepEqual(env.saved.weatherLocation, { latitude: 6.93, longitude: 79.86 })
  assert.equal(env.requests, 1)
})

test("turning weather off removes the saved location and weather", async () => {
  const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: 6.93, longitude: 79.86 },
    weather: { code: 61, isDay: true, updated: Date.now() } }, { inWidget: false, choices: [5, 1] })
  await env.run()
  assert.equal(env.saved.weatherEnabled, false)
  assert.equal(env.saved.weatherLocation, undefined)
  assert.equal(env.saved.weather, undefined)
})

test("failed weather requests do not repeat during the one hour retry window", async () => {
  const saved = { name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: 6.93, longitude: 79.86 } }
  const first = environment(saved, { requestFails: true })
  await first.run()
  assert.equal(first.requests, 1)
  const second = environment(first.saved, { requestFails: true })
  await second.run()
  assert.equal(second.requests, 0)
})
