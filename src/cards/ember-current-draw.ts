import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-current-draw-editor";

export interface DrawPhase {
  name?: string;
  power?: string; // W
  current?: string; // A
  voltage?: string; // V
}
export interface EmberCurrentDrawConfig extends LovelaceCardConfig {
  name?: string;
  icon?: string;
  color?: string; // amber | teal | green | hex
  total_power?: string; // W; if absent, sum of phase powers
  max_current?: number; // per-phase A rating for the gauge; default 25
  phases?: DrawPhase[];
  energy_today?: string; // kWh (today)
  voltage?: string; // single voltage readout (else per-phase in each row)
}

const numOf = (hass: HomeAssistant | undefined, e?: string): number | null => {
  if (!hass || !e) return null;
  const s = hass.states[e]?.state;
  return s == null || s === "" || isNaN(+s) ? null : +s;
};

const fmtPower = (w: number | null): { v: string; u: string } => {
  if (w == null) return { v: "—", u: "W" };
  if (Math.abs(w) >= 1000) return { v: (w / 1000).toFixed(2), u: "kW" };
  return { v: String(Math.round(w)), u: "W" };
};

// Live whole-home current draw for a 3-phase CT meter (e.g. Shelly Pro 3EM):
// big total power + a per-phase amp gauge (load vs the phase fuse rating).
// Reactive to hass, so it ticks with the meter's ~1s push. Degrades to "—"
// until the entities exist (safe to add before the hardware is installed).
export class EmberCurrentDraw extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberCurrentDrawConfig;

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 11px;
      }
      .head ha-icon {
        --mdc-icon-size: 24px;
        color: var(--ember-accent);
      }
      .head .title {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .live {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--ember-mono);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--disabled-text-color, #5b5b5b);
      }
      .dot.on {
        background: var(--ember-good);
      }
      .hero {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .hero .num {
        font-family: var(--ember-mono);
        font-size: 40px;
        font-weight: 600;
        line-height: 0.9;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .hero .unit {
        font-family: var(--ember-mono);
        font-size: 15px;
        color: var(--secondary-text-color);
      }
      .phases {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ph {
        display: grid;
        grid-template-columns: 26px 1fr auto;
        align-items: center;
        gap: 12px;
      }
      .ph .lbl {
        font-family: var(--ember-mono);
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .track {
        height: 10px;
        border-radius: 6px;
        background: rgba(127, 140, 150, 0.16);
        overflow: hidden;
      }
      .fill {
        height: 100%;
        border-radius: 6px;
        transition: width 0.4s ease;
      }
      .ph .val {
        font-family: var(--ember-mono);
        font-size: 12.5px;
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .ph .val .a {
        color: var(--secondary-text-color);
      }
      .foot {
        display: flex;
        gap: 22px;
        border-top: 1px solid var(--divider-color);
        padding-top: 12px;
        flex-wrap: wrap;
      }
      .foot .k {
        font-family: var(--ember-mono);
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .foot .v {
        font-family: var(--ember-mono);
        font-size: 15px;
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
      }
      .foot .cell {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
    `,
  ];

  setConfig(config: EmberCurrentDrawConfig): void {
    this.config = config;
  }
  getCardSize(): number {
    return 4;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-current-draw-editor");
  }
  static getStubConfig(): Omit<EmberCurrentDrawConfig, "type"> {
    return {
      name: "Current Draw",
      icon: "mdi:transmission-tower",
      max_current: 25,
      // Shelly Pro 3EM entity ids follow this shape once the device is added:
      total_power: "sensor.shellypro3em_total_active_power",
      phases: [
        { name: "L1", power: "sensor.shellypro3em_phase_a_active_power", current: "sensor.shellypro3em_phase_a_current", voltage: "sensor.shellypro3em_phase_a_voltage" },
        { name: "L2", power: "sensor.shellypro3em_phase_b_active_power", current: "sensor.shellypro3em_phase_b_current", voltage: "sensor.shellypro3em_phase_b_voltage" },
        { name: "L3", power: "sensor.shellypro3em_phase_c_active_power", current: "sensor.shellypro3em_phase_c_current", voltage: "sensor.shellypro3em_phase_c_voltage" },
      ],
      energy_today: "sensor.shellypro3em_total_active_energy",
    };
  }

  private accent(): string {
    const c = this.config?.color ?? "amber";
    if (c === "amber") return "var(--ember-accent)";
    if (c === "teal") return "var(--ember-teal)";
    if (c === "green") return "var(--ember-good)";
    return c;
  }
  // Only override the accent token for a NON-default colour (setting
  // --ember-accent:var(--ember-accent) is a self-cycle that breaks the var).
  private colorOverride(): string {
    const c = this.config?.color;
    return !c || c === "amber" ? "" : `--ember-accent:${this.accent()}`;
  }

  private phases(): DrawPhase[] {
    return this.config?.phases ?? [];
  }

  private total(): number | null {
    if (this.config?.total_power) return numOf(this.hass, this.config.total_power);
    const parts = this.phases()
      .map((p) => numOf(this.hass, p.power))
      .filter((v): v is number => v != null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }

  private loadColor(pct: number): string {
    if (pct >= 100) return "var(--ember-alert)";
    if (pct >= 80) return "var(--ember-warn)";
    return this.accent();
  }

  private renderPhase(p: DrawPhase, i: number): TemplateResult {
    const max = this.config?.max_current ?? 25;
    const a = numOf(this.hass, p.current);
    const w = numOf(this.hass, p.power);
    const pct = a == null ? 0 : Math.max(0, Math.min(120, (a / max) * 100));
    const shown = Math.min(100, pct);
    return html`
      <div class="ph">
        <span class="lbl">${p.name ?? "L" + (i + 1)}</span>
        <div class="track">
          <div class="fill" style="width:${shown}%;background:${this.loadColor(pct)}"></div>
        </div>
        <span class="val"
          >${w == null ? "—" : Math.round(w)} W
          <span class="a">· ${a == null ? "—" : a.toFixed(1)} A</span></span
        >
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const total = this.total();
    const { v, u } = fmtPower(total);
    const phases = this.phases();
    const energy = numOf(this.hass, this.config.energy_today);
    const volt = numOf(this.hass, this.config.voltage);
    const live = total != null;
    return html`
      <ha-card style=${this.colorOverride()}>
        <div class="head">
          <ha-icon .icon=${this.config.icon ?? "mdi:transmission-tower"}></ha-icon>
          <span class="title">${this.config.name ?? "Current Draw"}</span>
          <span class="live"><span class="dot ${live ? "on" : ""}"></span>${live ? "live" : "no data"}</span>
        </div>
        <div class="hero">
          <span class="num">${v}</span><span class="unit">${u}</span>
        </div>
        ${phases.length
          ? html`<div class="phases">${phases.map((p, i) => this.renderPhase(p, i))}</div>`
          : nothing}
        ${energy != null || volt != null
          ? html`<div class="foot">
              ${energy != null
                ? html`<div class="cell"><span class="k">Today</span><span class="v">${energy.toFixed(1)} kWh</span></div>`
                : nothing}
              ${volt != null
                ? html`<div class="cell"><span class="k">Voltage</span><span class="v">${Math.round(volt)} V</span></div>`
                : nothing}
            </div>`
          : nothing}
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-current-draw")) {
  customElements.define("ember-current-draw", EmberCurrentDraw);
  (window.customCards = window.customCards || []).push({
    type: "ember-current-draw",
    name: "Ember Current Draw",
    description: "Live 3-phase current draw (CT meter, e.g. Shelly Pro 3EM)",
    preview: true,
  });
}
