import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberAirConfig } from "./ember-air";

const LABELS: Record<string, string> = {
  entity: "Air quality sensor",
  pm25: "PM2.5 sensor",
  co2: "CO₂ sensor",
  toggle: "Display on/off switch",
  subtitle: "Subtitle",
};

export class EmberAirEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberAirConfig;

  setConfig(config: EmberAirConfig): void {
    this.config = config;
  }

  private label = (s: { name: string }) => LABELS[s.name] ?? s.name;

  private get schema() {
    return [
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      {
        type: "grid",
        schema: [
          { name: "pm25", selector: { entity: { domain: "sensor" } } },
          { name: "co2", selector: { entity: { domain: "sensor" } } },
        ],
      },
      { name: "toggle", selector: { entity: { domain: "switch" } } },
      { name: "subtitle", selector: { text: {} } },
    ];
  }

  private onChange(e: CustomEvent): void {
    e.stopPropagation();
    const config = { ...this.config, ...e.detail.value } as EmberAirConfig;
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
    );
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`<ha-form
      .hass=${this.hass}
      .data=${this.config}
      .schema=${this.schema}
      .computeLabel=${this.label}
      @value-changed=${this.onChange}
    ></ha-form>`;
  }
}

if (!customElements.get("ember-air-editor")) {
  customElements.define("ember-air-editor", EmberAirEditor);
}
