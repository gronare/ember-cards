import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberClimateStripConfig, ClimateTile } from "./ember-climate-strip";
import "../shared/entity-rows";

const ROW_SCHEMA = [
  { name: "name", selector: { text: {} } },
  {
    type: "grid",
    schema: [
      { name: "temp", selector: { entity: { domain: "sensor" } } },
      { name: "humidity", selector: { entity: { domain: "sensor" } } },
    ],
  },
];
const ROW_LABELS = { name: "Room name", temp: "Temp sensor", humidity: "Humidity sensor" };
const SCALAR_LABELS: Record<string, string> = { title: "Title", suffix: "Suffix (right)" };

export class EmberClimateStripEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberClimateStripConfig;

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

  setConfig(config: EmberClimateStripConfig): void {
    this.config = config;
  }

  private scalarLabel = (s: { name: string }) => SCALAR_LABELS[s.name] ?? s.name;

  private get scalarSchema() {
    return [
      {
        type: "grid",
        schema: [
          { name: "title", selector: { text: {} } },
          { name: "suffix", selector: { text: {} } },
        ],
      },
    ];
  }

  private emit(config: EmberClimateStripConfig): void {
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
    );
  }

  private onScalars(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config, ...e.detail.value } as EmberClimateStripConfig);
  }

  private onRooms(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config!, rooms: e.detail.value as ClimateTile[] });
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.scalarSchema}
        .computeLabel=${this.scalarLabel}
        @value-changed=${this.onScalars}
      ></ha-form>
      <div class="group">
        <h4>Rooms</h4>
        <ember-entity-rows
          .hass=${this.hass}
          .rows=${this.config.rooms ?? []}
          .rowSchema=${ROW_SCHEMA}
          .newRow=${{ name: "", temp: "", humidity: "" }}
          .labels=${ROW_LABELS}
          addLabel="+ Add room"
          @value-changed=${this.onRooms}
        ></ember-entity-rows>
      </div>
    `;
  }
}

if (!customElements.get("ember-climate-strip-editor")) {
  customElements.define("ember-climate-strip-editor", EmberClimateStripEditor);
}
