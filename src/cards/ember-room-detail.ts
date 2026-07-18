import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens } from "../shared/theme";
import { areaLights } from "../shared/hass";
import "./ember-room-detail-editor";

export interface EmberRoomDetailConfig extends LovelaceCardConfig {
  hash: string; // e.g. "#living-room"
  name?: string;
  icon?: string;
  area?: string; // auto-lists this area's lights when entities omitted
  entities?: string[];
}

const DIM_MODES = ["brightness", "hs", "rgb", "rgbw", "rgbww", "xy", "color_temp", "white"];
const COLOR_MODES = ["hs", "rgb", "rgbw", "rgbww", "xy", "color_temp"];

// Native room pop-up: shows on hash match, auto-lists the area's lights, strips
// the room prefix at DISPLAY (friendly_name stays intact for search), inline
// brightness slider + toggle + colour/temp (opens native more-info).
export class EmberRoomDetail extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberRoomDetailConfig;
  @state() private open = false;
  @state() private drag: { entity: string; pct: number } | null = null;
  private onHash = () => this.sync();

  static styles = [
    emberTokens,
    css`
      :host {
        display: contents;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 8;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 5vh 12px;
        overflow-y: auto;
      }
      .panel {
        width: 100%;
        max-width: 520px;
        background: var(--card-background-color, #1c1c1c);
        border-radius: 24px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .bar-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 6px 2px;
      }
      .bar-head .icon {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        background: rgba(127, 140, 150, 0.14);
        display: grid;
        place-items: center;
      }
      .bar-head .title {
        flex: 1;
        font-size: 20px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .close {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: none;
        background: rgba(127, 140, 150, 0.14);
        color: var(--primary-text-color);
        cursor: pointer;
        display: grid;
        place-items: center;
      }
      .row {
        background: rgba(127, 140, 150, 0.08);
        border: 1px solid var(--divider-color);
        border-radius: 16px;
        padding: 12px 14px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        grid-template-areas: "ico meta ctrl" "bar bar ctrl";
        column-gap: 12px;
        row-gap: 10px;
        align-items: center;
      }
      .row.nobar {
        grid-template-areas: "ico meta ctrl";
      }
      .licon {
        grid-area: ico;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: grid;
        place-items: center;
      }
      .lmeta {
        grid-area: meta;
        min-width: 0;
      }
      .lname {
        font-size: 15px;
        font-weight: 500;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lstate {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .track {
        grid-area: bar;
        height: 34px;
        border-radius: 10px;
        background: rgba(127, 140, 150, 0.18);
        overflow: hidden;
        cursor: pointer;
        touch-action: pan-y;
      }
      .fill {
        height: 100%;
        border-radius: 10px;
        background: var(--ember-accent);
      }
      .ctrl {
        grid-area: ctrl;
        display: flex;
        gap: 6px;
      }
      .cbtn {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        border: none;
        background: rgba(127, 140, 150, 0.14);
        color: var(--primary-text-color);
        cursor: pointer;
        display: grid;
        place-items: center;
      }
    `,
  ];

  setConfig(config: EmberRoomDetailConfig): void {
    if (!config.hash) throw new Error("ember-room-detail: 'hash' is required");
    this.config = config;
  }
  getCardSize(): number {
    return 1;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-room-detail-editor");
  }
  static getStubConfig(): Omit<EmberRoomDetailConfig, "type"> {
    return { hash: "#room", name: "Room", icon: "mdi:lightbulb-group" };
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
    this.sync();
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onHash);
  }
  private sync(): void {
    this.open = this.config != null && window.location.hash === this.config.hash;
  }
  private close(): void {
    if (window.location.hash === this.config?.hash) window.history.back();
    else this.sync();
  }

  private lights(): string[] {
    if (this.config?.entities?.length) return this.config.entities;
    if (this.hass && this.config?.area) return areaLights(this.hass, this.config.area).sort();
    return [];
  }

  private displayName(entity: string): string {
    const fn = this.hass?.states[entity]?.attributes?.friendly_name || entity;
    const room = this.config?.name;
    if (room && fn.toLowerCase().startsWith(room.toLowerCase() + " ")) return fn.slice(room.length + 1);
    return fn;
  }

  private modes(entity: string): string[] {
    return this.hass?.states[entity]?.attributes?.supported_color_modes || [];
  }
  private pct(entity: string): number {
    if (this.drag?.entity === entity) return this.drag.pct;
    const s = this.hass?.states[entity];
    if (!s || s.state !== "on") return 0;
    const b = s.attributes?.brightness;
    return b ? Math.round((b / 255) * 100) : 100;
  }

  private toggle(e: Event, entity: string): void {
    e.stopPropagation();
    this.hass?.callService("light", "toggle", { entity_id: entity });
  }
  private moreInfo(e: Event, entity: string): void {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId: entity }, bubbles: true, composed: true })
    );
  }
  private pctFrom(ev: PointerEvent): number {
    const el = ev.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, Math.round(((ev.clientX - r.left) / r.width) * 100)));
  }
  private setBrightness(entity: string, pct: number): void {
    this.hass?.callService("light", "turn_on", { entity_id: entity, brightness_pct: Math.round(pct) });
  }
  // gesture: don't touch the light until it's clearly a horizontal drag, so a
  // vertical scroll that starts on a track never changes brightness. `touch-
  // action: pan-y` lets the list scroll; we only claim horizontal moves.
  private g: { entity: string; sx: number; sliding: boolean; last: number } | null = null;
  private down(ev: PointerEvent, entity: string): void {
    this.g = { entity, sx: ev.clientX, sliding: false, last: 0 };
  }
  private move(ev: PointerEvent, entity: string): void {
    const g = this.g;
    if (!g || g.entity !== entity) return;
    if (!g.sliding) {
      if (Math.abs(ev.clientX - g.sx) < 6) return; // not yet a horizontal drag
      g.sliding = true;
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    }
    const pct = this.pctFrom(ev);
    this.drag = { entity, pct };
    const now = Date.now();
    if (now - g.last > 120) {
      g.last = now;
      this.setBrightness(entity, pct); // live update while dragging
    }
  }
  private up(ev: PointerEvent, entity: string): void {
    const g = this.g;
    this.g = null;
    if (!g || g.entity !== entity || !g.sliding) return; // a tap does nothing
    this.setBrightness(entity, this.pctFrom(ev));
    this.drag = null;
  }
  private cancel(): void {
    this.g = null;
    this.drag = null;
  }

  private row(entity: string): TemplateResult {
    const s = this.hass?.states[entity];
    const on = s?.state === "on";
    const dimmable = this.modes(entity).some((m) => DIM_MODES.includes(m));
    const colorful = this.modes(entity).some((m) => COLOR_MODES.includes(m));
    const rgb = s?.attributes?.rgb_color as number[] | undefined;
    const iconColor = on ? (rgb ? `rgb(${rgb.join(",")})` : "var(--ember-accent)") : "var(--secondary-text-color)";
    const iconBg = on ? (rgb ? `rgba(${rgb.join(",")},0.18)` : "var(--ember-accent-bg)") : "rgba(127,140,150,0.14)";
    const p = this.pct(entity);
    const sub = on ? (dimmable ? `${p}%` : "On") : "Off";
    return html`
      <div class="row ${dimmable ? "" : "nobar"}">
        <div class="licon" style="background:${iconBg}">
          <ha-icon
            .icon=${s?.attributes?.icon || "mdi:lightbulb"}
            style="color:${iconColor};cursor:pointer"
            @click=${(e: Event) => this.toggle(e, entity)}
          ></ha-icon>
        </div>
        <div class="lmeta">
          <div class="lname">${this.displayName(entity)}</div>
          <div class="lstate">${sub}</div>
        </div>
        ${dimmable
          ? html`<div
              class="track"
              @pointerdown=${(e: PointerEvent) => this.down(e, entity)}
              @pointermove=${(e: PointerEvent) => this.move(e, entity)}
              @pointerup=${(e: PointerEvent) => this.up(e, entity)}
              @pointercancel=${() => this.cancel()}
            >
              <div class="fill" style="width:${p}%"></div>
            </div>`
          : nothing}
        <div class="ctrl">
          ${colorful
            ? html`<button class="cbtn" title="Colour / temperature" @click=${(e: Event) => this.moreInfo(e, entity)}>
                <ha-icon icon="mdi:palette"></ha-icon>
              </button>`
            : nothing}
        </div>
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config || !this.open) return nothing;
    const lights = this.lights();
    return html`
      <div class="backdrop" @click=${() => this.close()}>
        <div class="panel" @click=${(e: Event) => e.stopPropagation()}>
          <div class="bar-head">
            <div class="icon"><ha-icon .icon=${this.config.icon || "mdi:lightbulb-group"}></ha-icon></div>
            <span class="title">${this.config.name || ""}</span>
            <button class="close" @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          ${lights.length
            ? lights.map((e) => this.row(e))
            : html`<div class="lstate" style="padding:10px 6px">No lights in this area.</div>`}
        </div>
      </div>
    `;
  }
}

if (!customElements.get("ember-room-detail")) {
  customElements.define("ember-room-detail", EmberRoomDetail);
  (window.customCards = window.customCards || []).push({
    type: "ember-room-detail",
    name: "Ember Room Detail",
    description: "Hash pop-up: area light list with brightness + colour",
    preview: false,
  });
}
