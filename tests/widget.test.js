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
    async presentSmall() {}, async presentMedium() {}, async presentLarge() {}, async presentAccessoryCircular() {},
    async presentAccessoryRectangular() {}, async presentAccessoryInline() {},
  }
}

function environment(saved, { family = "small", inWidget = true, query = {}, parameter = "", choices = [], requestFails = false, nameInput = "Nova" } = {}) {
  const output = { saved, collection: saved && saved.pets ? saved : null, widget: null, requests: 0, locationRequests: 0 }
  const fileManager = {
    documentsDirectory: () => "/docs",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: path => path.endsWith("alien-pets.json") ? Boolean(output.collection) : Boolean(saved && !saved.pets),
    readString: path => JSON.stringify(path.endsWith("alien-pets.json") ? output.collection : saved),
    writeString: (_, data) => {
      output.collection = JSON.parse(data)
      output.saved = output.collection.pets.find(pet => pet.id === output.collection.activeId) || output.collection.pets[0]
    },
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
    textFieldValue() { return nameInput }
    async presentSheet() { return choices.shift() ?? -1 }
    async present() { return choices.shift() ?? 0 }
  }
  class Request {
    constructor(url) { output.url = url }
    async loadJSON() {
      output.requests++
      output.crossSiteRedirect = this.onRedirect({ url: "https://example.com/collect" })
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
    Location: { setAccuracyToKilometer() {}, current: async () => {
      output.locationRequests++
      return { latitude: 12.3456, longitude: 45.6789 }
    } },
    URLScheme: { forRunningScript: () => "scriptable:///run/Alien%20Pet" },
    Script: { setWidget(widget) { output.widget = widget }, complete() {} },
    config: { runsInWidget: inWidget, widgetFamily: family },
    args: { queryParameters: query, widgetParameter: parameter },
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
  assert.match(env.widget.url, /action=pet&pet=blip$/)
  assert.ok(allText(env.widget).some(text => text.startsWith("updated ")))
  assert.equal(env.saved.name, "Blip")
})

test("all Lock Screen families render with the saved pet", async () => {
  for (const family of ["accessoryCircular", "accessoryRectangular", "accessoryInline"]) {
    const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0, skin: "blue", accessory: "crown" }, { family })
    await env.run()
    assert.ok(env.widget)
    assert.match(env.widget.url, /action=pet&pet=blip$/)
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

test("a deep link cannot silently trigger feed or play", async () => {
  for (const action of ["feed", "play"]) {
    const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0 },
      { inWidget: false, query: { action }, choices: [-1] })
    await env.run()
    assert.equal(env.saved.interactions, 0)
    assert.equal(env.saved.lastSnack, undefined)
    assert.equal(env.saved.lastPlayed, undefined)
  }
})

test("weather uses its cache and renders even when the network is not needed", async () => {
  const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: 12.35, longitude: 45.68 },
    weather: { code: 61, isDay: true, updated: Date.now() } })
  await env.run()
  assert.equal(env.requests, 0)
  assert.ok(allText(env.widget).some(text => text.includes("☔️")))
})

test("weather is enabled from the iPhone menu and stores an approximate location", async () => {
  const env = environment(null, { inWidget: false, choices: [5] })
  await env.run()
  assert.equal(env.saved.weatherEnabled, true)
  assert.deepEqual(env.saved.weatherLocation, { latitude: 12.35, longitude: 45.68 })
  assert.equal(env.requests, 1)
  assert.equal(env.locationRequests, 1)
  assert.match(env.url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=12\.35&longitude=45\.68&/)
  assert.equal(env.crossSiteRedirect, null)
})

test("declining weather leaves location and network access unused", async () => {
  const env = environment(null, { inWidget: false, choices: [5, 1] })
  await env.run()
  assert.equal(env.saved.weatherEnabled, undefined)
  assert.equal(env.locationRequests, 0)
  assert.equal(env.requests, 0)
})

test("invalid stored coordinates cannot enter a network request", async () => {
  const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: "12.35&extra=true", longitude: 45.68 } })
  await env.run()
  assert.equal(env.requests, 0)
})

test("turning weather off removes the saved location and weather", async () => {
  const env = environment({ name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: 12.35, longitude: 45.68 },
    weather: { code: 61, isDay: true, updated: Date.now() } }, { inWidget: false, choices: [5, 1] })
  await env.run()
  assert.equal(env.saved.weatherEnabled, false)
  assert.equal(env.saved.weatherLocation, undefined)
  assert.equal(env.saved.weather, undefined)
})

test("failed weather requests do not repeat during the one hour retry window", async () => {
  const saved = { name: "Nova", born: Date.now(), lastFed: Date.now(), lastPet: 0,
    weatherEnabled: true, weatherLocation: { latitude: 12.35, longitude: 45.68 } }
  const first = environment(saved, { requestFails: true })
  await first.run()
  assert.equal(first.requests, 1)
  const second = environment(first.saved, { requestFails: true })
  await second.run()
  assert.equal(second.requests, 0)
})

test("existing pet migrates without changing its birthday or original file", async () => {
  const born = Date.now() - 8 * 86400000
  const original = { name: "Nova", born, lastFed: born, lastPet: 0, interactions: 12 }
  const env = environment(original)
  await env.run()
  assert.equal(env.saved.born, born)
  assert.equal(env.saved.interactions, 12)
  assert.equal(env.collection.version, 2)
  assert.equal(env.collection.pets.length, 1)
  assert.deepEqual(original, { name: "Nova", born, lastFed: born, lastPet: 0, interactions: 12 })
})

test("Lock Screen parameter and tap action target the chosen pet", async () => {
  const now = Date.now()
  const collection = { version: 2, activeId: "blip", pets: [
    { id: "blip", name: "Blip", born: now, lastFed: now, lastPet: 0, interactions: 0 },
    { id: "nova", name: "Nova", born: now, lastFed: now, lastPet: 0, interactions: 0 },
  ] }
  const widget = environment(collection, { family: "accessoryRectangular", parameter: "nova" })
  await widget.run()
  assert.ok(allText(widget.widget).some(text => text === "Nova"))
  assert.match(widget.widget.url, /pet=nova$/)
  const tapped = environment(widget.collection, { inWidget: false, query: { action: "pet", pet: "nova" } })
  await tapped.run()
  assert.equal(tapped.collection.pets[0].interactions, 0)
  assert.equal(tapped.collection.pets[1].interactions, 1)
})

test("adopting a pet creates a unique ID and keeps the first pet", async () => {
  const first = environment(null, { inWidget: false, choices: [7, 1, 0], nameInput: "Blip" })
  await first.run()
  assert.deepEqual(first.collection.pets.map(pet => pet.id), ["blip", "blip-2"])
  assert.equal(first.collection.activeId, "blip-2")
})

test("large habitat shows care, growth, mission, and badges", async () => {
  const now = Date.now()
  const env = environment({ name: "Nova", born: now - 4 * 86400000, lastFed: now, lastPet: now, interactions: 12 }, { family: "large" })
  await env.run()
  const content = allText(env.widget).join(" ")
  assert.match(content, /little universe/)
  assert.match(content, /toward Captain/)
  assert.match(content, /First friend/)
  assert.match(content, /Feed a snack|Pet your alien|Play together/)
})

test("care action records journal and streak without repeated mission credit", async () => {
  const now = Date.now()
  const pet = { id: "blip", name: "Blip", born: now, lastFed: now, lastPet: 0, interactions: 0 }
  const collection = { version: 2, activeId: "blip", pets: [pet] }
  const widget = environment(collection, { family: "accessoryRectangular" })
  await widget.run()
  const task = allText(widget.widget).join(" ")
  const actionIndex = task.includes("Feed a snack") ? 1 : task.includes("Play together") ? 2 : 0
  const first = environment(widget.collection, { inWidget: false, choices: [actionIndex] })
  await first.run()
  const second = environment(first.collection, { inWidget: false, choices: [actionIndex] })
  await second.run()
  assert.equal(second.saved.interactions, 2)
  assert.equal(second.saved.journal.length, 2)
  assert.equal(second.saved.streakDays.length, 1)
  assert.equal(second.saved.missionDays.length, 1)
  assert.equal(second.saved.journal.filter(entry => entry.mission).length, 1)
})

test("three missions unlock the star accessory", async () => {
  const now = Date.now()
  const collection = { version: 2, activeId: "blip", pets: [{
    id: "blip", name: "Blip", born: now, lastFed: now, lastPet: 0,
    missionDays: ["2026-01-01", "2026-01-02", "2026-01-03"],
  }] }
  const env = environment(collection, { inWidget: false, choices: [4, 1, 3] })
  await env.run()
  assert.equal(env.saved.accessory, "star")
})
