import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-air-editor";

export interface EmberAirConfig extends LovelaceCardConfig {
  entity?: string; // air_quality (good/moderate/poor)
  pm25?: string;
  co2?: string;
  toggle?: string; // display on/off switch
  subtitle?: string;
  navigate?: string; // tap -> open this hash (e.g. an ember-sensor-detail popup)
}

const D = "sensor.alpstuga_air_quality_monitor";

export class EmberAir extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberAirConfig;

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas: "hd tgl" "body body";
        gap: 10px 8px;
      }
      ha-card.tappable {
        cursor: pointer;
      }
      ha-card.tappable:hover {
        border-color: #34373d;
      }
      .hd {
        grid-area: hd;
        display: flex;
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
      .tgl {
        grid-area: tgl;
        cursor: pointer;
        --mdc-icon-size: 22px;
      }
      .body {
        grid-area: body;
      }
      .row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
      }
      .val {
        font-size: 30px;
        font-weight: 750;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .meta {
        font-family: var(--ember-mono);
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .sub {
        font-family: var(--ember-mono);
        font-size: 11px;
        color: var(--secondary-text-color);
        letter-spacing: 0.03em;
        margin-top: 7px;
      }
    `,
  ];

  setConfig(config: EmberAirConfig): void {
    this.config = config;
  }
  getCardSize(): number {
    return 2;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-air-editor");
  }
  static getStubConfig(): Omit<EmberAirConfig, "type"> {
    return {
      entity: `${D}_air_quality`,
      pm25: `${D}_pm2_5`,
      co2: `${D}_carbon_dioxide`,
      toggle: "switch.alpstuga_air_quality_monitor",
      subtitle: "ALPSTUGA · Bedroom",
    };
  }

  private s(e?: string) {
    return e ? this.hass?.states[e] : undefined;
  }

  private toggleDisplay(e: Event): void {
    e.stopPropagation();
    if (this.config?.toggle)
      this.hass?.callService("homeassistant", "toggle", { entity_id: this.config.toggle });
  }
  private navigate(): void {
    if (this.config?.navigate) window.location.hash = this.config.navigate;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const c = this.config;
    const a = this.s(c.entity);
    const raw = a?.state ?? "—";
    const v = raw.charAt(0).toUpperCase() + raw.slice(1);
    const col =
      raw === "good" || !a
        ? "var(--primary-text-color)"
        : raw === "moderate"
        ? "var(--ember-warn)"
        : "var(--ember-alert)";
    const pm = this.s(c.pm25);
    const pmv = pm && !isNaN(+pm.state) ? Math.round(+pm.state) : "—";
    const co = this.s(c.co2);
    const cv = co && !isNaN(+co.state) ? Math.round(+co.state) : null;
    const cc =
      cv === null
        ? "var(--secondary-text-color)"
        : cv < 800
        ? "var(--secondary-text-color)"
        : cv < 1200
        ? "var(--ember-warn)"
        : "var(--ember-alert)";
    const tglOn = this.s(c.toggle)?.state === "on";
    return html`
      <ha-card class=${c.navigate ? "tappable" : ""} @click=${() => this.navigate()}>
        <div class="hd">
          <ha-icon icon="mdi:weather-windy"></ha-icon>
          <span class="t">Air quality</span>
        </div>
        ${c.toggle
          ? html`<ha-icon
              class="tgl"
              icon=${tglOn ? "mdi:monitor" : "mdi:monitor-off"}
              style="color:${tglOn ? "var(--info-color,#3f9bd6)" : "var(--disabled-text-color)"}"
              @click=${(e: Event) => this.toggleDisplay(e)}
            ></ha-icon>`
          : nothing}
        <div class="body">
          <div class="row">
            <span class="val" style="color:${col}">${v}</span>
            <span class="meta"
              >PM2.5 · ${pmv} µg/m³ · CO₂ ·
              <span style="color:${cc}">${cv === null ? "—" : cv} ppm</span></span
            >
          </div>
          ${c.subtitle ? html`<div class="sub">${c.subtitle}</div>` : nothing}
        </div>
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-air")) {
  customElements.define("ember-air", EmberAir);
  (window.customCards = window.customCards || []).push({
    type: "ember-air",
    name: "Ember Air Quality",
    description: "Air quality (Good/Moderate/Poor) + PM2.5 + CO₂ + display toggle",
    preview: true,
  });
}
