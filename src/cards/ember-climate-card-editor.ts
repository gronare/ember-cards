import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberClimateCardConfig, HealthItem } from "./ember-climate-card";
import "../shared/entity-rows";

const SCALAR_LABELS: Record<string, string> = {
  name: "Name",
  icon: "Icon",
  navigate: "Tap navigates to (hash)",
  temp: "Temperature sensor",
  humidity: "Humidity sensor",
};

const HEALTH_ROW_SCHEMA = [
  {
    type: "grid",
    schema: [
      { name: "label", selector: { text: {} } },
      { name: "entity", selector: { entity: {} } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "and", selector: { entity: {} } },
      {
        name: "mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "on", label: "On = healthy" },
              { value: "available", label: "Available = healthy" },
            ],
          },
        },
      },
    ],
  },
];

const HEALTH_LABELS = {
  label: "Label",
  entity: "Entity",
  and: "And entity (optional)",
  mode: "Healthy when",
};

export class EmberClimateCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberClimateCardConfig;

  static styles = css`
    .group {
      margin-top: 18px;
    }
    h4 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
  `;

  setConfig(config: EmberClimateCardConfig): void {
    this.config = config;
  }

  private label = (s: { name: string }) => SCALAR_LABELS[s.name] ?? s.name;

  private get scalarSchema() {
    return [
      {
        type: "grid",
        schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ],
      },
      { name: "navigate", selector: { text: {} } },
      {
        type: "grid",
        schema: [
          { name: "temp", selector: { entity: { domain: "sensor" } } },
          { name: "humidity", selector: { entity: { domain: "sensor" } } },
        ],
      },
    ];
  }

  private emit(config: EmberClimateCardConfig): void {
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  private onScalars(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config, ...e.detail.value } as EmberClimateCardConfig);
  }

  private onHealth(e: CustomEvent): void {
    e.stopPropagation();
    const health = e.detail.value as HealthItem[];
    this.emit({ ...this.config!, health: health.length ? health : undefined });
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.scalarSchema}
        .computeLabel=${this.label}
        @value-changed=${this.onScalars}
      ></ha-form>
      <div class="group">
        <h4>Health dots (optional)</h4>
        <ember-entity-rows
          .hass=${this.hass}
          .rows=${this.config.health ?? []}
          .rowSchema=${HEALTH_ROW_SCHEMA}
          .newRow=${{ label: "", entity: "", mode: "on" }}
          .labels=${HEALTH_LABELS}
          addLabel="+ Add health dot"
          @value-changed=${this.onHealth}
        ></ember-entity-rows>
      </div>
    `;
  }
}

if (!customElements.get("ember-climate-card-editor")) {
  customElements.define("ember-climate-card-editor", EmberClimateCardEditor);
}
