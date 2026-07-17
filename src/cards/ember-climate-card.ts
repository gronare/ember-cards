import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-climate-card-editor";

export interface HealthItem {
  label: string;
  entity: string;
  and?: string; // second entity that must also be healthy
  mode?: "on" | "available"; // how to judge healthy (default: state === "on")
}
export interface EmberClimateCardConfig extends LovelaceCardConfig {
  name?: string;
  icon?: string;
  navigate?: string;
  temp?: string;
  humidity?: string;
  health?: HealthItem[];
}

const num = (v: string | undefined, d = 1): string =>
  v == null || v === "" || isNaN(+v) ? "—" : (+v).toFixed(d);
const round = (v: string | undefined): string =>
  v == null || v === "" || isNaN(+v) ? "—" : String(Math.round(+v));

export class EmberClimateCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberClimateCardConfig;

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
      .head ha-icon {
        color: var(--secondary-text-color);
      }
      .body .t {
        font-size: 30px;
        font-weight: 800;
        color: var(--primary-text-color);
        line-height: 1;
      }
      .body .h {
        color: var(--secondary-text-color);
        font-size: 14px;
      }
      .health {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        border-top: 1px solid var(--divider-color);
        padding-top: 10px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .health .item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
    `,
  ];

  setConfig(config: EmberClimateCardConfig): void {
    this.config = config;
  }

  getCardSize(): number {
    return 2;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("ember-climate-card-editor");
  }

  static getStubConfig(): Omit<EmberClimateCardConfig, "type"> {
    return { name: "Room", icon: "mdi:thermometer" };
  }

  private stateOf(entity?: string): string | undefined {
    return entity ? this.hass?.states[entity]?.state : undefined;
  }

  private healthy(item: HealthItem): boolean {
    const ok = (e?: string): boolean => {
      const s = this.stateOf(e);
      if (item.mode === "available") return s != null && s !== "unavailable" && s !== "unknown";
      return s === "on";
    };
    return ok(item.entity) && (item.and ? ok(item.and) : true);
  }

  private navigate(): void {
    if (this.config?.navigate) window.location.hash = this.config.navigate;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const t = num(this.stateOf(this.config.temp));
    const h = round(this.stateOf(this.config.humidity));
    const health = this.config.health ?? [];
    return html`
      <ha-card @click=${() => this.navigate()}>
        <div class="head">
          <ha-icon .icon=${this.config.icon ?? "mdi:thermometer"}></ha-icon>
          <span class="title">${this.config.name ?? ""}</span>
        </div>
        <div class="body">
          <span class="t">${t}°</span> <span class="h">${h}% rh</span>
        </div>
        ${health.length
          ? html`<div class="health">
              ${health.map(
                (it) => html`<span class="item">
                  <span
                    class="dot"
                    style="background:${this.healthy(it) ? "#4CAF50" : "#E5705C"}"
                  ></span>
                  ${it.label}
                </span>`
              )}
            </div>`
          : nothing}
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-climate-card")) {
  customElements.define("ember-climate-card", EmberClimateCard);
  (window.customCards = window.customCards || []).push({
    type: "ember-climate-card",
    name: "Ember Climate",
    description: "Temp / humidity card with optional health dots",
    preview: true,
  });
}
