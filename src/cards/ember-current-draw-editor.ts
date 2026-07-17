import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberCurrentDrawConfig, DrawPhase } from "./ember-current-draw";
import "../shared/entity-rows";

const SCALAR_LABELS: Record<string, string> = {
  name: "Name",
  icon: "Icon",
  total_power: "Total power (blank = sum phases)",
  max_current: "Per-phase fuse rating (A)",
  energy_today: "Today energy (kWh)",
  voltage: "Voltage",
  color: "Colour",
};

const PHASE_SCHEMA = [
  {
    type: "grid",
    schema: [
      { name: "name", selector: { text: {} } },
      { name: "power", selector: { entity: { domain: "sensor" } } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "current", selector: { entity: { domain: "sensor" } } },
      { name: "voltage", selector: { entity: { domain: "sensor" } } },
    ],
  },
];
const PHASE_LABELS = { name: "Label", power: "Power (W)", current: "Current (A)", voltage: "Voltage (V)" };

export class EmberCurrentDrawEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberCurrentDrawConfig;

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

  setConfig(config: EmberCurrentDrawConfig): void {
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
      { name: "total_power", selector: { entity: { domain: "sensor" } } },
      {
        type: "grid",
        schema: [
          { name: "max_current", selector: { number: { min: 1, max: 200, step: 1, mode: "box" } } },
          {
            name: "color",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "amber", label: "Amber" },
                  { value: "teal", label: "Teal" },
                  { value: "green", label: "Green" },
                ],
              },
            },
          },
        ],
      },
      {
        type: "grid",
        schema: [
          { name: "energy_today", selector: { entity: { domain: "sensor" } } },
          { name: "voltage", selector: { entity: { domain: "sensor" } } },
        ],
      },
    ];
  }

  private emit(config: EmberCurrentDrawConfig): void {
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
    );
  }

  private onScalars(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config, ...e.detail.value } as EmberCurrentDrawConfig);
  }
  private onPhases(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config!, phases: e.detail.value as DrawPhase[] });
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
        <h4>Phases (L1 / L2 / L3)</h4>
        <ember-entity-rows
          .hass=${this.hass}
          .rows=${this.config.phases ?? []}
          .rowSchema=${PHASE_SCHEMA}
          .newRow=${{ name: "", power: "", current: "", voltage: "" }}
          .labels=${PHASE_LABELS}
          addLabel="+ Add phase"
          @value-changed=${this.onPhases}
        ></ember-entity-rows>
      </div>
    `;
  }
}

if (!customElements.get("ember-current-draw-editor")) {
  customElements.define("ember-current-draw-editor", EmberCurrentDrawEditor);
}
