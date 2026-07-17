import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import { areaLights } from "../shared/hass";
import "./ember-room-card-editor";

export interface Preset {
  entity: string;
  name?: string;
}

// A footer is a row of up to two segments (left / right), each rendered by kind.
export type FooterSegment =
  | { kind: "cover"; entity: string; label: string; open: string; closed: string }
  | { kind: "onoff"; entity: string; label: string }
  | { kind: "motion"; entity: string; label: string }
  | { kind: "lock"; entity: string; label: string }
  | { kind: "temphum"; entity: string; humidity: string }
  | { kind: "airquality"; entity: string; label: string }
  | { kind: "state"; entity: string; label: string };

export interface RoomFooter {
  segments: FooterSegment[];
}

export interface EmberRoomCardConfig extends LovelaceCardConfig {
  area: string;
  name?: string;
  icon?: string;
  navigate?: string;
  presets?: Preset[];
  footer?: RoomFooter;
  show_speaker?: boolean;
  speaker_entity?: string;
  speaker_name?: string;
}

const num = (v: string | undefined, d = 1): string =>
  v == null || v === "" || isNaN(+v) ? "—" : (+v).toFixed(d);
const round = (v: string | undefined): string =>
  v == null || v === "" || isNaN(+v) ? "—" : String(Math.round(+v));
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

export class EmberRoomCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberRoomCardConfig;

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
        cursor: pointer;
      }
      .head {
        justify-content: space-between;
      }
      .head .left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      /* master toggle */
      .toggle {
        flex: 0 0 auto;
        width: 50px;
        height: 28px;
        border-radius: 999px;
        position: relative;
        background: var(--disabled-text-color, #5b5b5b);
        transition: background 0.18s ease;
      }
      .toggle.on {
        background: var(--ember-accent);
      }
      .toggle::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #fff;
        transition: left 0.18s ease;
      }
      .toggle.on::after {
        left: 25px;
      }
      /* count */
      .count .n {
        font-size: 30px;
        font-weight: 800;
        color: var(--ember-accent);
        line-height: 1;
      }
      .count .of {
        color: var(--secondary-text-color);
        font-size: 14px;
      }
      /* pills */
      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        font-size: 13px;
        font-weight: 500;
        color: var(--primary-text-color);
        width: max-content;
      }
      .pill .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--secondary-text-color);
      }
      .pill.on {
        border-color: var(--ember-accent);
        background: var(--ember-accent-bg);
        color: var(--ember-accent-strong);
      }
      .pill.on .dot {
        background: var(--ember-accent);
      }
      /* speaker + footer share the top-border treatment */
      .speaker,
      .footer {
        border-top: 1px solid var(--divider-color);
        padding-top: 10px;
      }
      .speaker {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .speaker ha-icon {
        --mdc-icon-size: 22px;
        color: var(--secondary-text-color);
        flex: 0 0 auto;
      }
      .speaker .info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .speaker .sp-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .speaker .sp-state {
        font-size: 12px;
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .speaker .play {
        flex: 0 0 auto;
        --mdc-icon-size: 22px;
        color: var(--primary-text-color);
      }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
        color: var(--secondary-text-color);
      }
      .footer b {
        color: var(--primary-text-color);
        font-weight: 600;
      }
    `,
  ];

  setConfig(config: EmberRoomCardConfig): void {
    if (!config.area) throw new Error("ember-room-card: 'area' is required");
    this.config = config;
  }

  getCardSize(): number {
    return 4;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("ember-room-card-editor");
  }

  static getStubConfig(): Omit<EmberRoomCardConfig, "type"> {
    return { area: "", name: "Room", icon: "mdi:lightbulb-outline", presets: [] };
  }

  private st(entity?: string) {
    return entity && this.hass ? this.hass.states[entity] : undefined;
  }

  private lights(): { on: number; total: number } {
    if (!this.hass || !this.config) return { on: 0, total: 0 };
    const ls = areaLights(this.hass, this.config.area);
    const on = ls.filter((e) => this.hass!.states[e]?.state === "on").length;
    return { on, total: ls.length };
  }

  private navigate(): void {
    if (this.config?.navigate) window.location.hash = this.config.navigate;
  }

  private masterToggle(e: Event): void {
    e.stopPropagation();
    this.hass?.callService("script", "area_lights_master_toggle", {
      area: this.config!.area,
    });
  }

  private togglePreset(e: Event, entity: string): void {
    e.stopPropagation();
    this.hass?.callService("homeassistant", "toggle", { entity_id: entity });
  }

  private playPause(e: Event, entity: string): void {
    e.stopPropagation();
    this.hass?.callService("media_player", "media_play_pause", { entity_id: entity });
  }

  private renderPill(p: Preset): TemplateResult {
    const on = this.st(p.entity)?.state === "on";
    return html`<span
      class="pill ${on ? "on" : ""}"
      @click=${(e: Event) => this.togglePreset(e, p.entity)}
    >
      <span class="dot"></span>${p.name ?? p.entity}
    </span>`;
  }

  private renderSpeaker(): TemplateResult | typeof nothing {
    if (!this.config?.show_speaker || !this.config.speaker_entity) return nothing;
    const s = this.st(this.config.speaker_entity);
    const playing = s?.state === "playing";
    const paused = s?.state === "paused";
    const label = playing || paused ? s?.attributes?.media_title || cap(s!.state) : "Idle";
    return html`<div class="speaker">
      <ha-icon icon="mdi:speaker"></ha-icon>
      <div class="info">
        <span class="sp-name">${this.config.speaker_name ?? "SYMFONISK"}</span>
        <span class="sp-state">${label}</span>
      </div>
      <ha-icon
        class="play"
        icon=${playing ? "mdi:pause" : "mdi:play"}
        @click=${(e: Event) => this.playPause(e, this.config!.speaker_entity!)}
      ></ha-icon>
    </div>`;
  }

  private renderSegment(seg: FooterSegment): TemplateResult {
    switch (seg.kind) {
      case "cover": {
        const open = this.st(seg.entity)?.state === "open";
        return html`<span>${seg.label} · <b>${open ? seg.open : seg.closed}</b></span>`;
      }
      case "onoff": {
        const s = this.st(seg.entity)?.state;
        const on = s && s !== "off" && s !== "unavailable" && s !== "standby";
        return html`<span>${seg.label} · <b>${on ? "On" : "Off"}</b></span>`;
      }
      case "motion": {
        const on = this.st(seg.entity)?.state === "on";
        return html`<span>${seg.label} · <b>${on ? "Detected" : "Clear"}</b></span>`;
      }
      case "lock": {
        const s = this.st(seg.entity)?.state;
        const map: Record<string, [string, string]> = {
          locked: ["Locked", "#4CAF50"],
          unlocked: ["Unlocked", "#E5705C"],
          jammed: ["Jammed", "#E0A03C"],
        };
        const [txt, col] = map[s ?? ""] ?? ["—", "var(--secondary-text-color)"];
        return html`<span>${seg.label} · <b style="color:${col}">${txt}</b></span>`;
      }
      case "temphum": {
        const t = num(this.st(seg.entity)?.state);
        const h = round(this.st(seg.humidity)?.state);
        return html`<span>${t}° · <b>${h}% rh</b></span>`;
      }
      case "airquality": {
        const v = this.st(seg.entity)?.state ?? "—";
        const col =
          v === "good" ? "#4CAF50" : v === "moderate" ? "#E0A03C" : "#E5705C";
        return html`<span>${seg.label} · <b style="color:${col}">${cap(v)}</b></span>`;
      }
      default: {
        const v = this.st(seg.entity)?.state ?? "—";
        return html`<span>${seg.label} · <b>${v}</b></span>`;
      }
    }
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const { on, total } = this.lights();
    const anyOn = on > 0;
    const presets = this.config.presets ?? [];
    const segs = this.config.footer?.segments ?? [];
    return html`
      <ha-card class=${anyOn ? "lit" : ""} @click=${() => this.navigate()}>
        <div class="head">
          <div class="left">
            <ha-icon .icon=${this.config.icon ?? "mdi:lightbulb-outline"}></ha-icon>
            <span class="title">${this.config.name ?? this.config.area}</span>
          </div>
          <div
            class="toggle ${anyOn ? "on" : ""}"
            @click=${(e: Event) => this.masterToggle(e)}
          ></div>
        </div>
        <div class="count">
          <span class="n">${on}</span> <span class="of">of ${total} lights on</span>
        </div>
        ${presets.length
          ? html`<div class="pills">${presets.map((p) => this.renderPill(p))}</div>`
          : nothing}
        ${this.renderSpeaker()}
        ${segs.length
          ? html`<div class="footer">${segs.map((s) => this.renderSegment(s))}</div>`
          : nothing}
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-room-card")) {
  customElements.define("ember-room-card", EmberRoomCard);
  (window.customCards = window.customCards || []).push({
    type: "ember-room-card",
    name: "Ember Room",
    description: "Room card: lights count, presets, footer, speaker",
    preview: true,
  });
}
