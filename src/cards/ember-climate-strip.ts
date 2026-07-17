import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-climate-strip-editor";

export interface ClimateTile {
  name: string;
  temp?: string;
  humidity?: string;
  navigate?: string; // tap -> open this hash
}
export interface EmberClimateStripConfig extends LovelaceCardConfig {
  title?: string;
  suffix?: string;
  rooms?: ClimateTile[];
}

export class EmberClimateStrip extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberClimateStripConfig;

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .hd {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .hd .left {
        display: inline-flex;
        align-items: center;
        gap: 9px;
      }
      .hd ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .hd .t {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .hd .suffix {
        font-family: var(--ember-mono);
        font-size: 11px;
        color: var(--secondary-text-color);
        letter-spacing: 0.03em;
      }
      .tiles {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .tile {
        flex: 1 1 150px;
        min-width: 150px;
        box-sizing: border-box;
        background: rgba(127, 140, 150, 0.1);
        border-radius: 11px;
        padding: 11px 12px;
        border: 1px solid transparent;
        transition: 0.12s;
      }
      .tile.tappable {
        cursor: pointer;
      }
      .tile.tappable:hover {
        border-color: #34373d;
        background: rgba(127, 140, 150, 0.14);
      }
      .tile.tappable:active {
        transform: scale(0.985);
      }
      .tile .name {
        font-size: 11.5px;
        color: var(--secondary-text-color);
        font-family: var(--ember-mono);
      }
      .tile .temp {
        font-size: 21px;
        font-weight: 700;
        color: var(--primary-text-color);
        letter-spacing: -0.02em;
        margin-top: 2px;
        font-variant-numeric: tabular-nums;
      }
      .tile .temp sup {
        font-size: 11px;
        font-weight: 500;
        color: var(--secondary-text-color);
      }
      .tile .hum {
        font-size: 11.5px;
        color: var(--ember-teal);
        font-family: var(--ember-mono);
        margin-top: 1px;
      }
    `,
  ];

  setConfig(config: EmberClimateStripConfig): void {
    this.config = config;
  }
  getCardSize(): number {
    return 2;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-climate-strip-editor");
  }
  static getStubConfig(): Omit<EmberClimateStripConfig, "type"> {
    return { title: "Climate", rooms: [] };
  }

  private s(e?: string) {
    return e ? this.hass?.states[e] : undefined;
  }

  private navigate(hash?: string): void {
    if (hash) window.location.hash = hash;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const rooms = this.config.rooms ?? [];
    return html`
      <ha-card>
        <div class="hd">
          <span class="left">
            <ha-icon icon="mdi:thermometer"></ha-icon>
            <span class="t">${this.config.title ?? "Climate"}</span>
          </span>
          ${this.config.suffix ? html`<span class="suffix">${this.config.suffix}</span>` : nothing}
        </div>
        <div class="tiles">
          ${rooms.map((r) => {
            const t = this.s(r.temp);
            const h = this.s(r.humidity);
            const tv = t && !isNaN(+t.state) ? (+t.state).toFixed(1) : "—";
            const hv = h && !isNaN(+h.state) ? Math.round(+h.state) : "—";
            return html`<div
              class="tile ${r.navigate ? "tappable" : ""}"
              @click=${() => this.navigate(r.navigate)}
            >
              <div class="name">${r.name}</div>
              <div class="temp">${tv}<sup>°C</sup></div>
              <div class="hum">${hv}% rh</div>
            </div>`;
          })}
        </div>
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-climate-strip")) {
  customElements.define("ember-climate-strip", EmberClimateStrip);
  (window.customCards = window.customCards || []).push({
    type: "ember-climate-strip",
    name: "Ember Climate Strip",
    description: "Per-room temperature / humidity tiles",
    preview: true,
  });
}
