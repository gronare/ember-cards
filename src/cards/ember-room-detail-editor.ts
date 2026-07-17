import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberRoomDetailConfig } from "./ember-room-detail";

const LABELS: Record<string, string> = {
  area: "Area (auto-lists its lights)",
  name: "Name",
  icon: "Icon",
  hash: "Hash (matches the room card's navigate)",
};

export class EmberRoomDetailEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberRoomDetailConfig;

  setConfig(config: EmberRoomDetailConfig): void {
    this.config = config;
  }

  private label = (s: { name: string }) => LABELS[s.name] ?? s.name;

  private get schema() {
    return [
      {
        type: "grid",
        schema: [
          { name: "area", selector: { area: {} } },
          { name: "icon", selector: { icon: {} } },
        ],
      },
      { name: "name", selector: { text: {} } },
      { name: "hash", selector: { text: {} } },
    ];
  }

  private onChange(e: CustomEvent): void {
    e.stopPropagation();
    const config = { ...this.config, ...e.detail.value } as EmberRoomDetailConfig;
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

if (!customElements.get("ember-room-detail-editor")) {
  customElements.define("ember-room-detail-editor", EmberRoomDetailEditor);
}
