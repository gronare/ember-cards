// ember-cards — Home Assistant custom Lovelace card library
//
// One bundle registers every card. Each card module self-registers via
// customElements.define + pushes an entry to window.customCards (so it shows in
// the "Add card" picker). Shared theme tokens + editor kit live in src/shared/.
//
// Cards are added here as they are built:
import "./cards/ember-room-card";
import "./cards/ember-room-detail";
import "./cards/ember-sensor-detail";
import "./cards/ember-shortcuts-row";
import "./cards/ember-climate-card";
import "./cards/ember-header";
import "./cards/ember-actionables";
import "./cards/ember-air";
import "./cards/ember-climate-strip";
import "./cards/ember-statistics-card";
import "./cards/ember-metric";
import "./cards/ember-current-draw";

export const VERSION = "0.0.23";

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
window.customCards = window.customCards || [];

console.info(
  `%c ember-cards %c ${VERSION} `,
  "background:#E0A03C;color:#111;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px",
  "background:#333;color:#E0A03C;border-radius:0 4px 4px 0;padding:2px 4px"
);
