# Ember Cards

A small library of custom [Home Assistant](https://www.home-assistant.io/) Lovelace
cards — warm, information-dense tiles built with [Lit](https://lit.dev/) and
TypeScript. They're plain web components and work on any Home Assistant install.

Everything ships as **one JavaScript file** (`ember-cards.js`) that registers all the
cards below, so you add a single Lovelace resource and they all show up in the
"Add card" picker.

> **Heads up:** most cards are generic and configurable through their visual editor,
> but a few assume particular entities or helper scripts (e.g. `ember-room-card`'s
> master toggle calls a `script.area_lights_master_toggle`). Treat this as a starting
> point, not a plug-and-play theme.

## Cards

| Card type | Name | What it does |
|---|---|---|
| `ember-header` | Ember Header | Greeting + live clock + presence chips |
| `ember-room-card` | Ember Room | Room tile: lights-on count, scene presets, footer sensors, speaker |
| `ember-room-detail` | Ember Room Detail | Room light pop-up: row-as-slider brightness + inline colour/warmth |
| `ember-actionables` | Ember Actionables | Tiered "what needs me now" — alert / active / ambient |
| `ember-climate-card` | Ember Climate | Temperature / humidity card with optional health dots |
| `ember-climate-strip` | Ember Climate Strip | Per-room temperature / humidity tiles |
| `ember-air` | Ember Air Quality | Air quality (Good/Moderate/Poor) + PM2.5 + CO₂ |
| `ember-sensor-detail` | Ember Sensor Detail | Hash pop-up: last-24h graphs for one or more sensors |
| `ember-statistics-card` | Ember Statistics | Historical chart for any long-term statistic |
| `ember-metric` | Ember Metric | Compact single-value statistic tile (period + norm comparison) |
| `ember-current-draw` | Ember Current Draw | Live 3-phase current draw (CT meter, e.g. Shelly Pro 3EM) |
| `ember-shortcuts-row` | Ember Shortcuts | A row of scene / script shortcut tiles |

Most cards include a **visual editor** — once installed you can configure them from
the dashboard UI without writing YAML.

## Requirements

- Home Assistant (any reasonably recent version — these use the standard custom-card
  API and `custom-card-helpers`).
- A browser with ES2021 support (any current browser).

## Installation

### Option A — HACS (custom repository)

1. In Home Assistant, open **HACS**.
2. Top-right **⋮** → **Custom repositories**.
3. Add the repository URL `https://github.com/gronare/ember-cards` with category
   **Dashboard** (a.k.a. Lovelace / Plugin).
4. Find **Ember Cards** in the list, **Download** it.
5. HACS adds the Lovelace resource for you. Reload your browser (hard refresh).

### Option B — Manual

1. Download `ember-cards.js` from the
   [latest release](https://github.com/gronare/ember-cards/releases/latest).
2. Copy it into your HA config, creating the folder if needed:

   ```
   config/www/ember-cards/ember-cards.js
   ```

   (`config/www/` is served at `/local/`.)
3. Register it as a Lovelace resource — **Settings → Dashboards → ⋮ → Resources →
   Add resource**:
   - **URL:** `/local/ember-cards/ember-cards.js?v=0.0.25`
   - **Type:** JavaScript Module
4. Hard-refresh the browser.

> **Cache busting:** Home Assistant does not version `/local/` files, so browsers
> cache them aggressively. After every update, bump the `?v=` query on the resource
> URL (e.g. `?v=0.0.26`) — otherwise you'll keep loading the old bundle and cards may
> show "Custom element doesn't exist" / a configuration error.

## Using a card

After installing, edit a dashboard → **Add card** and search for "Ember", or drop in
YAML directly. Minimal example:

```yaml
type: custom:ember-room-card
area: bedroom
name: Bedroom
icon: mdi:bed
```

Cards that render as pop-ups (`ember-room-detail`, `ember-sensor-detail`) are opened
by navigating to a hash and are placed in a section so they mount but stay hidden
until triggered — see the card's editor / source for the `hash` option.

## Updating

- **HACS:** update from the HACS UI, then bump the resource `?v=` if the cards look
  stale.
- **Manual:** replace `config/www/ember-cards/ember-cards.js` with the new release
  file and bump the `?v=` on the resource URL.

## Building from source

```bash
git clone https://github.com/gronare/ember-cards.git
cd ember-cards
npm install
npm run build      # outputs dist/ember-cards.js
# npm run dev       # rebuild on change
```

The build is a single self-contained ES bundle — Lit is bundled in, so Home
Assistant only ever loads one file. Entry point and the list of registered cards live
in `src/ember-cards.ts`; each card is a self-registering module under `src/cards/`.

## License

[MIT](LICENSE)
