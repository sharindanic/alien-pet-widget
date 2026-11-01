# Building Alien Pet

Alien Pet began in October 2026 as a small pixel character for an iPhone Home Screen. [Scriptable](https://scriptable.app/) made it possible to build the widget in JavaScript without an Xcode project.

## First version

The alien is drawn with `DrawContext` from a 16 × 14 character grid. Its eyes and mouth are placed on that grid according to its mood. Charging state, battery level, time of day, and petting determine which mood appears.

The script keeps the pet's name, birthday, and recent actions in a local JSON file managed by `FileManager.local()`. Keeping the same Scriptable script name when updating the code preserves that state.

Two useful lessons from the first version:

- Scriptable uses `Font.regularRoundedSystemFont`; `Font.roundedSystemFont` is not an available method.
- `config.widgetFamily` is `null` during an in-app preview, so previews pass the intended size explicitly.

## Growing the pet

The November 2026 update added three skins, a crown and bow, Feed snack and Play actions, and visible growth stages based on age and interactions. An optional weather setting uses an approximate saved location to fetch current conditions from Open-Meteo. The widget caches weather and can remove its saved location from the menu.

Home Screen widgets show their last draw time because iOS controls the actual refresh schedule. Circular, rectangular, and inline Lock Screen layouts share the same local pet state. A widget tap runs the script through Scriptable's URL scheme and records a Pet action.

The feature work was reviewed in [PR #1](https://github.com/sharindanic/alien-pet-widget/pull/1). A later [documentation update](https://github.com/sharindanic/alien-pet-widget/pull/2) added the illustrated sprite preview. The local test suite checks the main widget flows with Scriptable mocks; visual layout and tap behavior still need an iPhone check.
