import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberHeaderConfig, Person } from "./ember-header";
import "../shared/entity-rows";

const ROW_SCHEMA = [
  {
    type: "grid",
    schema: [
      { name: "entity", selector: { entity: { domain: "person" } } },
      { name: "initial", selector: { text: {} } },
    ],
  },
  { name: "distance", selector: { entity: { domain: "sensor" } } },
];
const LABELS = {
  entity: "Person",
  initial: "Initial (blank = first letter)",
  distance: "Away-distance sensor (optional)",
};

export class EmberHeaderEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberHeaderConfig;

  setConfig(config: EmberHeaderConfig): void {
    this.config = config;
  }

  private onRows(e: CustomEvent): void {
    e.stopPropagation();
    const config = { ...this.config, people: e.detail.value as Person[] } as EmberHeaderConfig;
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
    );
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`<ember-entity-rows
      .hass=${this.hass}
      .rows=${this.config.people ?? []}
      .rowSchema=${ROW_SCHEMA}
      .newRow=${{ entity: "", initial: "", distance: "" }}
      .labels=${LABELS}
      addLabel="+ Add person"
      @value-changed=${this.onRows}
    ></ember-entity-rows>`;
  }
}

if (!customElements.get("ember-header-editor")) {
  customElements.define("ember-header-editor", EmberHeaderEditor);
}
