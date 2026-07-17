import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens } from "../shared/theme";
import "./ember-shortcuts-row-editor";

export interface Shortcut {
  entity: string;
  name?: string;
  icon?: string;
  label?: string;
}
export interface EmberShortcutsRowConfig extends LovelaceCardConfig {
  shortcuts?: Shortcut[];
}

// A row of scene/script shortcut tiles: accent icon-chip + name (+ optional
// mono sublabel). Name/icon fall back to the entity's own attributes so a new
// scene shows up sensibly without configuring anything.
export class EmberShortcutsRow extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberShortcutsRowConfig;

  static styles = [
    emberTokens,
    css`
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .tile {
        flex: 1 1 150px;
        display: grid;
        grid-template-columns: min-content 1fr;
        grid-template-areas: "chip name" "chip label";
        column-gap: 10px;
        row-gap: 1px;
        align-items: center;
        padding: 12px 13px;
        border-radius: 11px;
        border: 1px solid var(--divider-color);
        background: rgba(127, 140, 150, 0.08);
        cursor: pointer;
      }
      .tile:hover {
        border-color: var(--ember-accent);
      }
      .chip {
        grid-area: chip;
        width: 30px;
        height: 30px;
        border-radius: 9px;
        background: var(--ember-accent-bg);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .chip ha-icon {
        --mdc-icon-size: 17px;
        color: var(--ember-accent);
      }
      .name {
        grid-area: name;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .label {
        grid-area: label;
        font-size: 11px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        color: var(--secondary-text-color);
      }
    `,
  ];

  setConfig(config: EmberShortcutsRowConfig): void {
    this.config = config;
  }

  getCardSize(): number {
    return 1;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("ember-shortcuts-row-editor");
  }

  static getStubConfig(): Omit<EmberShortcutsRowConfig, "type"> {
    return { shortcuts: [] };
  }

  private attr(entity: string, key: string): string | undefined {
    return this.hass?.states[entity]?.attributes?.[key];
  }

  private activate(entity: string): void {
    const domain = entity.split(".")[0];
    const service = domain === "scene" || domain === "script" ? domain : "homeassistant";
    this.hass?.callService(service, "turn_on", { entity_id: entity });
  }

  private tile(s: Shortcut): TemplateResult {
    const icon = s.icon ?? this.attr(s.entity, "icon") ?? "mdi:play-circle";
    const name = s.name ?? this.attr(s.entity, "friendly_name") ?? s.entity;
    return html`
      <div class="tile" @click=${() => this.activate(s.entity)}>
        <div class="chip"><ha-icon icon=${icon}></ha-icon></div>
        <span class="name">${name}</span>
        ${s.label ? html`<span class="label">${s.label}</span>` : nothing}
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const shortcuts = this.config.shortcuts ?? [];
    if (!shortcuts.length) return nothing;
    return html`<div class="row">${shortcuts.map((s) => this.tile(s))}</div>`;
  }
}

if (!customElements.get("ember-shortcuts-row")) {
  customElements.define("ember-shortcuts-row", EmberShortcutsRow);
  (window.customCards = window.customCards || []).push({
    type: "ember-shortcuts-row",
    name: "Ember Shortcuts",
    description: "A row of scene / script shortcut tiles",
    preview: true,
  });
}
