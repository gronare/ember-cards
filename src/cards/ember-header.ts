import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens } from "../shared/theme";
import "./ember-header-editor";

export interface Person {
  entity: string;
  initial?: string;
  distance?: string; // sensor giving metres when away
}
export interface EmberHeaderConfig extends LovelaceCardConfig {
  people?: Person[];
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => ("0" + n).slice(-2);

export class EmberHeader extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberHeaderConfig;
  @state() private now = new Date();
  private timer?: number;

  static styles = [
    emberTokens,
    css`
      :host {
        display: block;
      }
      .wrap {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .date {
        font-family: var(--ember-mono);
        font-size: 13px;
        color: var(--secondary-text-color);
        letter-spacing: 0.04em;
      }
      .greet {
        font-size: 26px;
        font-weight: 650;
        letter-spacing: -0.02em;
        color: var(--primary-text-color);
        margin-top: 2px;
      }
      .people {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        padding: 5px 13px 5px 5px;
      }
      .chip .badge {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        color: #fff;
        display: inline-grid;
        place-items: center;
        font-size: 12px;
        font-weight: 700;
        font-family: var(--ember-mono);
      }
      .chip .txt {
        line-height: 1.2;
        text-align: left;
      }
      .chip .nm {
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .chip .st {
        font-size: 10.5px;
        font-family: var(--ember-mono);
      }
    `,
  ];

  setConfig(config: EmberHeaderConfig): void {
    this.config = config;
  }
  getCardSize(): number {
    return 1;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-header-editor");
  }
  static getStubConfig(): Omit<EmberHeaderConfig, "type"> {
    return { people: [] };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 20000);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) clearInterval(this.timer);
  }

  private greeting(h: number): string {
    return h < 5 ? "God natt" : h < 12 ? "God morgon" : h < 18 ? "God dag" : "God kväll";
  }

  private chip(p: Person): TemplateResult {
    const st = this.hass?.states[p.entity];
    const home = st?.state === "home";
    let name = (st?.attributes?.friendly_name || p.entity).split(" ")[0];
    let lbl = home ? "Home" : "Away";
    if (!home && p.distance) {
      const ds = this.hass?.states[p.distance];
      if (ds && !isNaN(+ds.state)) lbl = "Away · " + (+ds.state / 1000).toFixed(1) + " km";
    }
    const dot = home ? "var(--ember-good)" : "var(--disabled-text-color,#6e7a86)";
    const stc = home ? "var(--ember-good)" : "var(--secondary-text-color)";
    const initial = p.initial || name.charAt(0).toUpperCase();
    return html`<span class="chip">
      <span class="badge" style="background:${dot}">${initial}</span>
      <span class="txt">
        <span class="nm">${name}</span><br />
        <span class="st" style="color:${stc}">${lbl}</span>
      </span>
    </span>`;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const d = this.now;
    const dateLine = `${DAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
    const people = this.config.people ?? [];
    return html`
      <div class="wrap">
        <div>
          <div class="date">${dateLine}</div>
          <div class="greet">${this.greeting(d.getHours())}</div>
        </div>
        <div class="people">${people.map((p) => this.chip(p))}</div>
      </div>
    `;
  }
}

if (!customElements.get("ember-header")) {
  customElements.define("ember-header", EmberHeader);
  (window.customCards = window.customCards || []).push({
    type: "ember-header",
    name: "Ember Header",
    description: "Greeting + live clock + presence chips",
    preview: true,
  });
}
