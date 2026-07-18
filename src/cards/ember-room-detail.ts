import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens } from "../shared/theme";
import { areaLights } from "../shared/hass";
import "./ember-room-detail-editor";

export interface EmberRoomDetailConfig extends LovelaceCardConfig {
  hash: string;
  name?: string;
  icon?: string;
  area?: string;
  entities?: string[];
}

type Tier = "bright" | "white" | "colour";
type RGB = [number, number, number];

const WARM = [
  { label: "Candle", k: 2200, c: "#FF9B40" },
  { label: "Cosy", k: 2700, c: "#FFBE7A" },
  { label: "Neutral", k: 3500, c: "#FFE3C0" },
  { label: "Cool", k: 5000, c: "#DCE8FF" },
];
const COLOURS = [
  { label: "Ember", h: 30, s: 90 },
  { label: "Rose", h: 345, s: 65 },
  { label: "Teal", h: 174, s: 70 },
  { label: "Violet", h: 265, s: 60 },
  { label: "Sky", h: 210, s: 70 },
];

const clampByte = (x: number): number => Math.max(0, Math.min(255, Math.round(x)));
function kelvinToRgb(k: number): RGB {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  return [clampByte(r), clampByte(g), clampByte(b)];
}
function hsToRgb(h: number, s: number): RGB {
  const sat = s / 100;
  const c = sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = 1 - c;
  return [clampByte((r + m) * 255), clampByte((g + m) * 255), clampByte((b + m) * 255)];
}
const rgba = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

// Room light pop-up: the row IS the brightness gauge + toggle; colour/warmth is
// an inline accordion revealed on tap, capability-aware per lamp. Designed by
// fable (see vault). Scroll-safe live-drag; a master row up top.
export class EmberRoomDetail extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberRoomDetailConfig;
  @state() private open = false;
  @state() private drag: { entity: string; pct: number } | null = null;
  @state() private expanded: string | null = null;
  @state() private seg: Record<string, "white" | "colour"> = {};

  private onHash = () => this.sync();
  private g: null | {
    kind: "row" | "master";
    entity?: string;
    sx: number;
    sy: number;
    t0: number;
    sliding: boolean;
    last: number;
    width: number;
    startPct?: number;
    starts?: [string, number][];
  } = null;
  private sg: null | { last: number; left: number; width: number; apply: (f: number) => void } = null;

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
        background: var(--card-background-color, #17181c);
        border-radius: 24px;
        max-height: 82vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 20px 20px 16px;
        border-bottom: 1px solid var(--divider-color);
      }
      .head .icon {
        width: 44px;
        height: 44px;
        border-radius: 999px;
        background: var(--ember-accent-bg);
        display: grid;
        place-items: center;
      }
      .head .icon ha-icon {
        color: var(--ember-accent);
      }
      .head .title {
        flex: 1;
        font-size: 19px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .close {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: none;
        background: rgba(255, 255, 255, 0.05);
        color: var(--primary-text-color);
        cursor: pointer;
        display: grid;
        place-items: center;
      }
      .close:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .body {
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .lamp {
        display: flex;
        flex-direction: column;
      }
      .lrow {
        position: relative;
        height: 56px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid transparent;
        touch-action: pan-y;
        cursor: pointer;
      }
      .lrow.master {
        height: 62px;
      }
      .lrow.master.on {
        border-color: rgba(224, 160, 60, 0.28);
      }
      .fill {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        background: rgba(127, 140, 150, 0.08);
        transition: width 0.12s linear;
      }
      .row-content {
        position: relative;
        height: 100%;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap: 11px;
        padding: 0 14px 0 8px;
      }
      .chip {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        flex: none;
      }
      .name {
        min-width: 0;
        font-size: 14.5px;
        font-weight: 500;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .name.off {
        color: var(--secondary-text-color);
      }
      .name .sub {
        display: block;
        font-family: var(--ember-mono);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        margin-top: 1px;
      }
      .read {
        font-family: var(--ember-mono);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        min-width: 38px;
        text-align: right;
      }
      .read.off {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .cap {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .cap.white {
        background: linear-gradient(135deg, #ff9b40, #dce8ff);
      }
      .cap.colour {
        background: conic-gradient(from 0deg, #ff5a5a, #ffe14d, #6dff6d, #4dffff, #6d6dff, #ff5aff, #ff5a5a);
      }
      /* accordion */
      .acc {
        overflow: hidden;
        animation: acc-in 0.16s ease-out;
      }
      @keyframes acc-in {
        from {
          opacity: 0;
          transform: translateY(-6px);
        }
      }
      .pane {
        padding: 14px 6px 6px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .segs {
        display: flex;
        gap: 6px;
      }
      .segs button {
        font-family: var(--ember-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 5px 14px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      .segs button.on {
        color: var(--ember-accent);
        background: rgba(224, 160, 60, 0.12);
        border-color: rgba(224, 160, 60, 0.5);
      }
      .plabel {
        display: flex;
        justify-content: space-between;
        font-family: var(--ember-mono);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .plabel .v {
        color: var(--primary-text-color);
      }
      .swatches {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
      }
      .sw {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        cursor: pointer;
      }
      .sw .dot {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid transparent;
        transition: 0.12s;
      }
      .sw.sel .dot {
        box-shadow: 0 0 0 2px var(--card-background-color, #17181c), 0 0 0 4px #fff;
        transform: scale(1.04);
      }
      .sw .cl {
        font-family: var(--ember-mono);
        font-size: 9px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .sw.sel .cl {
        color: var(--primary-text-color);
      }
      .free {
        height: 32px;
        border-radius: 999px;
        position: relative;
        cursor: pointer;
        touch-action: none;
      }
      .free.thin {
        height: 22px;
      }
      .free .thumb {
        position: absolute;
        top: 50%;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
      }
      .free.thin .thumb {
        width: 16px;
        height: 16px;
      }
      /* two-column list on wider screens */
      @media (min-width: 640px) {
        .panel {
          max-width: 780px;
        }
        .body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 12px;
          align-content: start;
        }
        .lamp.full {
          grid-column: 1 / -1;
        }
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
    const open = this.config != null && window.location.hash === this.config.hash;
    if (!open) this.expanded = null;
    this.open = open;
  }
  private close(): void {
    if (window.location.hash === this.config?.hash) window.history.back();
    else this.sync();
  }

  private st(e: string) {
    return this.hass?.states[e];
  }
  private lights(): string[] {
    if (this.config?.entities?.length) return this.config.entities;
    if (this.hass && this.config?.area) return areaLights(this.hass, this.config.area).sort();
    return [];
  }
  private displayName(entity: string): string {
    const fn = this.st(entity)?.attributes?.friendly_name || entity;
    const room = this.config?.name;
    if (room && fn.toLowerCase().startsWith(room.toLowerCase() + " ")) return fn.slice(room.length + 1);
    return fn;
  }
  private tier(entity: string): Tier {
    const m: string[] = this.st(entity)?.attributes?.supported_color_modes || [];
    if (m.some((x) => ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(x))) return "colour";
    if (m.includes("color_temp")) return "white";
    return "bright";
  }
  private briPct(entity: string): number {
    const s = this.st(entity);
    if (!s || s.state !== "on") return 0;
    const b = s.attributes?.brightness;
    return b ? Math.round((b / 255) * 100) : 100;
  }
  private briLive(entity: string): number {
    return this.drag?.entity === entity ? this.drag.pct : this.briPct(entity);
  }
  private lampRgb(entity: string): RGB | null {
    const s = this.st(entity);
    if (!s || s.state !== "on") return null;
    const c = s.attributes?.rgb_color;
    if (Array.isArray(c) && c.length === 3) return c as RGB;
    const k = s.attributes?.color_temp_kelvin;
    if (k) return kelvinToRgb(k);
    return [224, 160, 60];
  }

  // ── services ──
  private toggle(e: Event, entity: string): void {
    e.stopPropagation();
    this.hass?.callService("light", "toggle", { entity_id: entity });
  }
  private setBri(entity: string, pct: number): void {
    this.hass?.callService("light", "turn_on", { entity_id: entity, brightness_pct: Math.round(pct) });
  }
  private setKelvin(entity: string, k: number): void {
    this.hass?.callService("light", "turn_on", { entity_id: entity, color_temp_kelvin: Math.round(k) });
  }
  private setHs(entity: string, h: number, s: number): void {
    this.hass?.callService("light", "turn_on", { entity_id: entity, hs_color: [Math.round(h), Math.round(s)] });
  }

  // ── row gesture (relative brightness + tap-to-expand) ──
  private rowDown(ev: PointerEvent, entity: string, master: boolean): void {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (master) {
      const lit = this.lights().filter((e) => this.st(e)?.state === "on");
      this.g = { kind: "master", sx: ev.clientX, sy: ev.clientY, t0: Date.now(), sliding: false, last: 0, width: r.width, starts: lit.map((e) => [e, this.briPct(e)]) };
    } else {
      this.g = { kind: "row", entity, sx: ev.clientX, sy: ev.clientY, t0: Date.now(), sliding: false, last: 0, width: r.width, startPct: this.briPct(entity) };
    }
  }
  private rowMove(ev: PointerEvent): void {
    const g = this.g;
    if (!g) return;
    if (!g.sliding) {
      const dx = ev.clientX - g.sx;
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(ev.clientY - g.sy)) return;
      g.sliding = true;
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    }
    const delta = ((ev.clientX - g.sx) / g.width) * 100;
    const now = Date.now();
    const throttled = now - g.last > 120;
    if (throttled) g.last = now;
    if (g.kind === "row" && g.entity) {
      const pct = Math.max(1, Math.min(100, (g.startPct ?? 0) + delta));
      this.drag = { entity: g.entity, pct };
      if (throttled) this.setBri(g.entity, pct);
    } else if (g.kind === "master" && g.starts && throttled) {
      g.starts.forEach(([e, start]) => this.setBri(e, Math.max(1, Math.min(100, start + delta))));
    }
  }
  private rowUp(ev: PointerEvent): void {
    const g = this.g;
    this.g = null;
    if (!g) return;
    if (g.sliding) {
      const delta = ((ev.clientX - g.sx) / g.width) * 100;
      if (g.kind === "row" && g.entity) {
        this.setBri(g.entity, Math.max(1, Math.min(100, (g.startPct ?? 0) + delta)));
        this.drag = null;
      } else if (g.kind === "master" && g.starts) {
        g.starts.forEach(([e, start]) => this.setBri(e, Math.max(1, Math.min(100, start + delta))));
      }
      return;
    }
    // tap
    if (Date.now() - g.t0 > 450) return;
    if (g.kind === "master") this.masterToggle();
    else if (g.entity && this.tier(g.entity) !== "bright") this.expanded = this.expanded === g.entity ? null : g.entity;
  }
  private masterToggle(): void {
    const ls = this.lights();
    const anyOn = ls.some((e) => this.st(e)?.state === "on");
    this.hass?.callService("light", anyOn ? "turn_off" : "turn_on", { entity_id: ls });
  }

  // ── free slider (absolute) ──
  private slDown(ev: PointerEvent, apply: (f: number) => void): void {
    ev.stopPropagation();
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.sg = { last: 0, left: r.left, width: r.width, apply };
    this.slApply(ev, true);
  }
  private slMove(ev: PointerEvent): void {
    if (this.sg) this.slApply(ev, false);
  }
  private slUp(ev: PointerEvent): void {
    if (this.sg) {
      this.slApply(ev, true);
      this.sg = null;
    }
  }
  private slApply(ev: PointerEvent, force: boolean): void {
    const g = this.sg;
    if (!g) return;
    const f = Math.max(0, Math.min(1, (ev.clientX - g.left) / g.width));
    const now = Date.now();
    if (force || now - g.last > 110) {
      g.last = now;
      g.apply(f);
    }
  }

  // ── render ──
  private renderRow(entity: string): TemplateResult {
    const s = this.st(entity);
    const on = s?.state === "on";
    const pct = this.briLive(entity);
    const c = this.lampRgb(entity);
    const tier = this.tier(entity);
    const fillBg = on && c ? rgba(c, 0.16) : "rgba(127,140,150,0.08)";
    const edge = on && c ? `2px solid ${rgba(c, 0.55)}` : "none";
    const chipBg = on && c ? rgba(c, 0.16) : "rgba(127,140,150,0.12)";
    const iconCol = on && c ? rgb(c) : "var(--secondary-text-color)";
    return html`
      <div class="lamp">
        <div
          class="lrow"
          @pointerdown=${(e: PointerEvent) => this.rowDown(e, entity, false)}
          @pointermove=${(e: PointerEvent) => this.rowMove(e)}
          @pointerup=${(e: PointerEvent) => this.rowUp(e)}
          @pointercancel=${() => (this.g = null)}
        >
          <div class="fill" style="width:${on ? pct : 0}%;background:${fillBg};border-right:${edge}"></div>
          <div class="row-content">
            <span class="chip" style="background:${chipBg}" @pointerdown=${(e: Event) => e.stopPropagation()} @click=${(e: Event) => this.toggle(e, entity)}>
              <ha-icon .icon=${s?.attributes?.icon || "mdi:lightbulb"} style="color:${iconCol}"></ha-icon>
            </span>
            <span class="name ${on ? "" : "off"}">${this.displayName(entity)}</span>
            ${on ? html`<span class="read">${pct}%</span>` : html`<span class="read off">off</span>`}
            ${tier === "bright" ? nothing : html`<span class="cap ${tier}"></span>`}
          </div>
        </div>
        ${this.expanded === entity ? html`<div class="acc">${this.renderAcc(entity, tier)}</div>` : nothing}
      </div>
    `;
  }

  private renderMaster(): TemplateResult {
    const ls = this.lights();
    const lit = ls.filter((e) => this.st(e)?.state === "on");
    const anyOn = lit.length > 0;
    const avg = anyOn ? Math.round(lit.reduce((a, e) => a + this.briLive(e), 0) / lit.length) : 0;
    return html`
      <div class="lamp full">
        <div
          class="lrow master ${anyOn ? "on" : ""}"
          @pointerdown=${(e: PointerEvent) => this.rowDown(e, "", true)}
          @pointermove=${(e: PointerEvent) => this.rowMove(e)}
          @pointerup=${(e: PointerEvent) => this.rowUp(e)}
          @pointercancel=${() => (this.g = null)}
        >
          <div class="fill" style="width:${avg}%;background:${anyOn ? "rgba(224,160,60,0.14)" : "rgba(127,140,150,0.08)"}"></div>
          <div class="row-content">
            <span class="chip" style="background:${anyOn ? "var(--ember-accent-bg)" : "rgba(127,140,150,0.12)"}" @pointerdown=${(e: Event) => e.stopPropagation()} @click=${() => this.masterToggle()}>
              <ha-icon icon="mdi:lightbulb-group" style="color:${anyOn ? "var(--ember-accent)" : "var(--secondary-text-color)"}"></ha-icon>
            </span>
            <span class="name">All lights<span class="sub">${lit.length} of ${ls.length} on</span></span>
            ${anyOn ? html`<span class="read">${avg}%</span>` : html`<span class="read off">off</span>`}
          </div>
        </div>
      </div>
    `;
  }

  private renderAcc(entity: string, tier: Tier): TemplateResult {
    if (tier === "white") return html`<div class="pane">${this.renderWarmth(entity)}</div>`;
    const view = this.seg[entity] ?? (this.st(entity)?.attributes?.color_mode === "color_temp" ? "white" : "colour");
    return html`
      <div class="pane">
        <div class="segs">
          <button class=${view === "white" ? "on" : ""} @click=${() => (this.seg = { ...this.seg, [entity]: "white" })}>White</button>
          <button class=${view === "colour" ? "on" : ""} @click=${() => (this.seg = { ...this.seg, [entity]: "colour" })}>Colour</button>
        </div>
        ${view === "white" ? this.renderWarmth(entity) : this.renderColour(entity)}
      </div>
    `;
  }

  private renderWarmth(entity: string): TemplateResult {
    const a = this.st(entity)?.attributes ?? {};
    const mn = a.min_color_temp_kelvin ?? 2000;
    const mx = a.max_color_temp_kelvin ?? 6535;
    const cur = a.color_temp_kelvin ?? 2700;
    const presets = WARM.filter((p) => p.k >= mn - 60 && p.k <= mx + 60);
    const grad = `linear-gradient(90deg, ${rgb(kelvinToRgb(mn))}, ${rgb(kelvinToRgb((mn + mx) / 2))}, ${rgb(kelvinToRgb(mx))})`;
    const frac = Math.max(0, Math.min(1, (cur - mn) / (mx - mn)));
    return html`
      <div class="plabel"><span>Warmth</span><span class="v">${Math.round(cur)}K</span></div>
      <div class="swatches">
        ${presets.map(
          (p) => html`<span class="sw ${Math.abs(cur - p.k) <= 60 ? "sel" : ""}" @click=${() => this.setKelvin(entity, p.k)}>
            <span class="dot" style="background:${p.c}"></span><span class="cl">${p.label}</span>
          </span>`
        )}
      </div>
      <div
        class="free"
        style="background:${grad}"
        @pointerdown=${(e: PointerEvent) => this.slDown(e, (f) => this.setKelvin(entity, mn + f * (mx - mn)))}
        @pointermove=${(e: PointerEvent) => this.slMove(e)}
        @pointerup=${(e: PointerEvent) => this.slUp(e)}
        @pointercancel=${() => (this.sg = null)}
      >
        <span class="thumb" style="left:${frac * 100}%;background:${rgb(kelvinToRgb(cur))}"></span>
      </div>
    `;
  }

  private renderColour(entity: string): TemplateResult {
    const a = this.st(entity)?.attributes ?? {};
    const hs = Array.isArray(a.hs_color) ? a.hs_color : [30, 90];
    const [h, sat] = hs as [number, number];
    const hueGrad = "linear-gradient(90deg,#ff5a5a,#ffe14d,#6dff6d,#4dffff,#6d6dff,#ff5aff,#ff5a5a)";
    const satGrad = `linear-gradient(90deg,#fff,${rgb(hsToRgb(h, 100))})`;
    return html`
      <div class="plabel"><span>Colour</span><span class="v"><span class="cap" style="display:inline-block;width:14px;height:14px;background:${rgb(hsToRgb(h, sat))}"></span></span></div>
      <div class="swatches">
        ${COLOURS.map(
          (p) => html`<span class="sw ${Math.abs(h - p.h) <= 8 && Math.abs(sat - p.s) <= 8 ? "sel" : ""}" @click=${() => this.setHs(entity, p.h, p.s)}>
            <span class="dot" style="background:${rgb(hsToRgb(p.h, p.s))}"></span><span class="cl">${p.label}</span>
          </span>`
        )}
      </div>
      <div
        class="free"
        style="background:${hueGrad}"
        @pointerdown=${(e: PointerEvent) => this.slDown(e, (f) => this.setHs(entity, f * 360, sat))}
        @pointermove=${(e: PointerEvent) => this.slMove(e)}
        @pointerup=${(e: PointerEvent) => this.slUp(e)}
        @pointercancel=${() => (this.sg = null)}
      >
        <span class="thumb" style="left:${(h / 360) * 100}%;background:${rgb(hsToRgb(h, sat))}"></span>
      </div>
      <div
        class="free thin"
        style="background:${satGrad}"
        @pointerdown=${(e: PointerEvent) => this.slDown(e, (f) => this.setHs(entity, h, f * 100))}
        @pointermove=${(e: PointerEvent) => this.slMove(e)}
        @pointerup=${(e: PointerEvent) => this.slUp(e)}
        @pointercancel=${() => (this.sg = null)}
      >
        <span class="thumb" style="left:${sat}%;background:${rgb(hsToRgb(h, sat))}"></span>
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config || !this.open) return nothing;
    const lights = this.lights();
    return html`
      <div class="backdrop" @click=${() => this.close()}>
        <div class="panel" @click=${(e: Event) => e.stopPropagation()}>
          <div class="head">
            <div class="icon"><ha-icon .icon=${this.config.icon || "mdi:lightbulb-group"}></ha-icon></div>
            <span class="title">${this.config.name ?? ""}</span>
            <button class="close" @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="body">
            ${lights.length
              ? html`${this.renderMaster()}${lights.map((e) => this.renderRow(e))}`
              : html`<div class="plabel" style="padding:10px 6px">No lights in this area.</div>`}
          </div>
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
    description: "Room light pop-up: row-as-slider brightness + inline colour/warmth",
    preview: false,
  });
}
