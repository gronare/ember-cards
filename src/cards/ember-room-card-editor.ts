import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberRoomCardConfig } from "./ember-room-card";
import "../shared/entity-rows";
import "./footer-rows";

const LABELS: Record<string, string> = {
  area: "Area",
  icon: "Icon",
  name: "Name",
  navigate: "Tap navigates to (hash)",
  show_speaker: "Show speaker widget",
  speaker_entity: "Speaker (media player)",
  speaker_name: "Speaker label",
};

export class EmberRoomCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberRoomCardConfig;

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

  setConfig(config: EmberRoomCardConfig): void {
    this.config = config;
  }

  private label = (s: { name: string }) => LABELS[s.name] ?? s.name;

  private get scalarSchema() {
    return [
      {
        type: "grid",
        schema: [
          { name: "area", selector: { area: {} } },
          { name: "icon", selector: { icon: {} } },
        ],
      },
      { name: "name", selector: { text: {} } },
      { name: "navigate", selector: { text: {} } },
    ];
  }

  private speakerSchema(show: boolean) {
    const base: unknown[] = [{ name: "show_speaker", selector: { boolean: {} } }];
    if (show) {
      base.push({
        type: "grid",
        schema: [
          { name: "speaker_entity", selector: { entity: { domain: "media_player" } } },
          { name: "speaker_name", selector: { text: {} } },
        ],
      });
    }
    return base;
  }

  private emit(config: EmberRoomCardConfig): void {
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
    this.emit({ ...this.config, ...e.detail.value } as EmberRoomCardConfig);
  }

  private onSpeaker(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config, ...e.detail.value } as EmberRoomCardConfig);
  }

  private onPresets(e: CustomEvent): void {
    e.stopPropagation();
    this.emit({ ...this.config!, presets: e.detail.value });
  }

  private onFooter(e: CustomEvent): void {
    e.stopPropagation();
    const segments = e.detail.value;
    this.emit({
      ...this.config!,
      footer: segments.length ? { segments } : undefined,
    });
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const c = this.config;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${c}
        .schema=${this.scalarSchema}
        .computeLabel=${this.label}
        @value-changed=${this.onScalars}
      ></ha-form>

      <div class="group">
        <h4>Presets — lights shown as pills</h4>
        <ember-entity-rows
          .hass=${this.hass}
          .rows=${c.presets ?? []}
          @value-changed=${this.onPresets}
        ></ember-entity-rows>
      </div>

      <div class="group">
        <h4>Speaker</h4>
        <ha-form
          .hass=${this.hass}
          .data=${c}
          .schema=${this.speakerSchema(!!c.show_speaker)}
          .computeLabel=${this.label}
          @value-changed=${this.onSpeaker}
        ></ha-form>
      </div>

      <div class="group">
        <h4>Footer — up to two items</h4>
        <ember-footer-rows
          .hass=${this.hass}
          .rows=${c.footer?.segments ?? []}
          @value-changed=${this.onFooter}
        ></ember-footer-rows>
      </div>
    `;
  }
}

if (!customElements.get("ember-room-card-editor")) {
  customElements.define("ember-room-card-editor", EmberRoomCardEditor);
}
