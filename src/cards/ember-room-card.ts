import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import { areaLights } from "../shared/hass";

export interface Preset {
  entity: string;
  name?: string;
}
export interface RoomFooter {
  mode?: "sensors" | "media" | "none";
  sensors?: Array<{ entity: string; label?: string }>;
}
export interface EmberRoomCardConfig extends LovelaceCardConfig {
  area: string;
  name?: string;
  icon?: string;
  navigate?: string;
  presets?: Preset[];
  footer?: RoomFooter;
  show_speaker?: boolean;
  speaker_entity?: string;
}

// Phase 1 stub: renders the header + live "N of M lights on" count so the
// build/vendor/render pipeline is proven end to end. Pills, master toggle,
// footer and speaker land in Phase 2 (parity with ember-cards-live-spec).
export class EmberRoomCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberRoomCardConfig;

  static styles = [
    emberTokens,
    emberCard,
    css`
      .count {
        margin-top: 14px;
      }
      .count .n {
        font-size: 30px;
        font-weight: 800;
        color: var(--ember-accent);
        line-height: 1;
      }
      .count .of {
        color: var(--secondary-text-color);
        font-size: 14px;
      }
    `,
  ];

  setConfig(config: EmberRoomCardConfig): void {
    if (!config.area) throw new Error("ember-room-card: 'area' is required");
    this.config = config;
  }

  getCardSize(): number {
    return 3;
  }

  static getStubConfig(): Omit<EmberRoomCardConfig, "type"> {
    return { area: "", name: "Room", icon: "mdi:lightbulb-outline", presets: [] };
  }

  private lights(): { on: number; total: number } {
    if (!this.hass || !this.config) return { on: 0, total: 0 };
    const ls = areaLights(this.hass, this.config.area);
    const on = ls.filter((e) => this.hass!.states[e]?.state === "on").length;
    return { on, total: ls.length };
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const { on, total } = this.lights();
    return html`
      <ha-card class=${on > 0 ? "lit" : ""}>
        <div class="head">
          <ha-icon .icon=${this.config.icon ?? "mdi:lightbulb-outline"}></ha-icon>
          <span class="title">${this.config.name ?? this.config.area}</span>
        </div>
        <div class="count">
          <span class="n">${on}</span>
          <span class="of">of ${total} lights on</span>
        </div>
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-room-card")) {
  customElements.define("ember-room-card", EmberRoomCard);
  (window.customCards = window.customCards || []).push({
    type: "ember-room-card",
    name: "Ember Room",
    description: "Room card: lights count, presets, footer, speaker",
    preview: true,
  });
}
