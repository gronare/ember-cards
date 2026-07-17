import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberShortcutsRowConfig, Shortcut } from "./ember-shortcuts-row";
import "../shared/entity-rows";

const ROW_SCHEMA = [
  {
    type: "grid",
    schema: [
      { name: "entity", selector: { entity: { domain: ["scene", "script"] } } },
      { name: "name", selector: { text: {} } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "icon", selector: { icon: {} } },
      { name: "label", selector: { text: {} } },
    ],
  },
];

const LABELS = {
  entity: "Scene / script",
  name: "Name (blank = entity name)",
  icon: "Icon (blank = entity icon)",
  label: "Sub-label",
};

export class EmberShortcutsRowEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberShortcutsRowConfig;

  setConfig(config: EmberShortcutsRowConfig): void {
    this.config = config;
  }

  private onRows(e: CustomEvent): void {
    e.stopPropagation();
    const config = {
      ...this.config,
      shortcuts: e.detail.value as Shortcut[],
    } as EmberShortcutsRowConfig;
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`
      <ember-entity-rows
        .hass=${this.hass}
        .rows=${this.config.shortcuts ?? []}
        .rowSchema=${ROW_SCHEMA}
        .newRow=${{ entity: "", name: "", icon: "", label: "" }}
        .labels=${LABELS}
        addLabel="+ Add shortcut"
        @value-changed=${this.onRows}
      ></ember-entity-rows>
    `;
  }
}

if (!customElements.get("ember-shortcuts-row-editor")) {
  customElements.define("ember-shortcuts-row-editor", EmberShortcutsRowEditor);
}
