import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";

type Tint = "amber" | "teal" | "good" | "warn";
interface Item {
  icon: string;
  tint: Tint;
  label: string;
  value: TemplateResult | string;
  bar?: number;
  badge?: { text?: string; icon?: string; tint: Tint; click?: string };
}

export interface EmberActionablesConfig extends LovelaceCardConfig {
  washer?: { status?: string; remaining?: string; total?: string; operation?: string; name?: string };
}

const WASH_ON = ["run", "running", "wash", "washing", "rinse", "rinsing", "spin", "spinning", "drying", "steam"];
const TINT: Record<Tint, [string, string]> = {
  amber: ["var(--ember-accent)", "var(--ember-accent-bg)"],
  teal: ["var(--ember-teal)", "var(--ember-teal-bg)"],
  good: ["var(--ember-good)", "rgba(82,181,131,0.13)"],
  warn: ["var(--ember-warn)", "rgba(224,169,74,0.14)"],
};

// Dynamic "what needs me now": washer -> playing media -> active timer ->
// updates -> calm. Shows at most two items, highest priority first.
export class EmberActionables extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberActionablesConfig;
  @state() private tick = 0;
  private timer?: number;

  static styles = [
    emberTokens,
    emberCard,
    css`
      .item {
        display: flex;
        gap: 16px;
        align-items: center;
      }
      .item + .item {
        border-top: 1px solid var(--divider-color);
        margin-top: 13px;
        padding-top: 13px;
      }
      .chip {
        width: 54px;
        height: 54px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        flex: none;
      }
      .chip ha-icon {
        --mdc-icon-size: 28px;
      }
      .info {
        flex: 1;
        min-width: 0;
        text-align: left;
      }
      .lbl {
        font-size: 11.5px;
        color: var(--secondary-text-color);
        font-family: var(--ember-mono);
        text-transform: uppercase;
        letter-spacing: 0.09em;
      }
      .val {
        font-size: 18px;
        font-weight: 650;
        color: var(--primary-text-color);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .val b {
        font-variant-numeric: tabular-nums;
      }
      .bar {
        height: 6px;
        border-radius: 6px;
        background: rgba(127, 140, 150, 0.15);
        margin-top: 10px;
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        border-radius: 6px;
        background: linear-gradient(90deg, var(--gr-teal, #2e9b93), var(--ember-good));
      }
      .badge {
        font-family: var(--ember-mono);
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 7px;
        letter-spacing: 0.02em;
        flex: none;
        display: inline-flex;
        align-items: center;
      }
      .badge ha-icon {
        --mdc-icon-size: 20px;
        display: block;
      }
      .badge.click {
        cursor: pointer;
      }
      .badge.click:hover {
        filter: brightness(1.15);
      }
    `,
  ];

  setConfig(config: EmberActionablesConfig): void {
    this.config = config;
  }
  getCardSize(): number {
    return 2;
  }
  static getStubConfig(): Omit<EmberActionablesConfig, "type"> {
    return {};
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.tick = this.tick + 1), 20000);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) clearInterval(this.timer);
  }

  private items(): Item[] {
    const hass = this.hass;
    if (!hass) return [];
    const items: Item[] = [];
    const w = this.config?.washer ?? {};
    const statusE = w.status ?? "sensor.wall_e_current_status";
    const ws = hass.states[statusE];
    const wsSt = ws ? String(ws.state).toLowerCase() : "";
    if (WASH_ON.includes(wsSt)) {
      const rt = hass.states[w.remaining ?? "sensor.wall_e_remaining_time"];
      const tt = hass.states[w.total ?? "sensor.wall_e_total_time"];
      let rem: number | null = null;
      if (rt && rt.state && !["unknown", "unavailable"].includes(rt.state))
        rem = Math.max(0, Math.round((new Date(rt.state).getTime() - Date.now()) / 60000));
      let pct: number | null = null;
      if (rem != null && tt && !isNaN(+tt.state) && +tt.state > 0)
        pct = Math.min(98, Math.max(3, Math.round(100 * (1 - rem / +tt.state))));
      const op = hass.states[w.operation ?? "select.wall_e_operation"];
      const prog = op && !["unknown", "unavailable"].includes(op.state) ? op.state : "";
      items.push({
        icon: "mdi:washing-machine",
        tint: "amber",
        label: (w.name ?? "Wall-E") + (prog ? " · " + prog : ""),
        value: html`Washing — <b style="color:var(--ember-teal)">${rem != null ? rem + " min" : "…"}</b> remaining`,
        bar: pct == null ? 60 : pct,
        badge: { text: "RUNNING", tint: "teal" },
      });
    }
    Object.keys(hass.states)
      .filter((e) => e.startsWith("media_player.") && hass.states[e].state === "playing")
      .slice(0, 2)
      .forEach((e) => {
        const m = hass.states[e];
        const t = m.attributes.media_title || "Playing";
        const art = m.attributes.media_artist || m.attributes.app_name || "";
        const nm = m.attributes.friendly_name || e.split(".")[1];
        items.push({
          icon: "mdi:music-note",
          tint: "teal",
          label: "Now playing · " + nm,
          value: t + (art ? " — " + art : ""),
          badge: { icon: "mdi:pause", tint: "teal", click: e },
        });
      });
    Object.keys(hass.states)
      .filter((e) => e.startsWith("timer.") && hass.states[e].state === "active")
      .forEach((e) => {
        const tm = hass.states[e];
        const fin = tm.attributes.finishes_at
          ? Math.max(0, Math.round((new Date(tm.attributes.finishes_at).getTime() - Date.now()) / 60000))
          : null;
        items.push({
          icon: "mdi:timer-outline",
          tint: "warn",
          label: "Timer",
          value: html`${tm.attributes.friendly_name || e}${fin != null
            ? html` — <b style="color:var(--ember-warn)">${fin} min</b> left`
            : ""}`,
        });
      });
    if (!items.length) {
      const up = Object.keys(hass.states).filter(
        (e) => e.startsWith("update.") && hass.states[e].state === "on"
      ).length;
      if (up > 0)
        items.push({
          icon: "mdi:package-up",
          tint: "warn",
          label: "Maintenance",
          value: `${up} update${up > 1 ? "s" : ""} available`,
        });
    }
    if (!items.length)
      items.push({
        icon: "mdi:check-circle-outline",
        tint: "good",
        label: "All clear",
        value: "Nothing needs you right now",
      });
    return items.slice(0, 2);
  }

  private playPause(e: Event, entity: string): void {
    e.stopPropagation();
    this.hass?.callService("media_player", "media_play_pause", { entity_id: entity });
  }

  private renderItem(it: Item): TemplateResult {
    const [fg, bg] = TINT[it.tint];
    const badge = it.badge;
    return html`
      <div class="item">
        <span class="chip" style="background:${bg};color:${fg}">
          <ha-icon icon=${it.icon}></ha-icon>
        </span>
        <span class="info">
          <div class="lbl">${it.label}</div>
          <div class="val">${it.value}</div>
          ${it.bar != null
            ? html`<div class="bar"><i style="width:${it.bar}%"></i></div>`
            : nothing}
        </span>
        ${badge
          ? html`<span
              class="badge ${badge.click ? "click" : ""}"
              style="color:${TINT[badge.tint][0]};background:${TINT[badge.tint][1]}"
              @click=${badge.click ? (ev: Event) => this.playPause(ev, badge.click!) : undefined}
              >${badge.icon ? html`<ha-icon icon=${badge.icon}></ha-icon>` : badge.text}</span
            >`
          : nothing}
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`<ha-card>${this.items().map((it) => this.renderItem(it))}</ha-card>`;
  }
}

if (!customElements.get("ember-actionables")) {
  customElements.define("ember-actionables", EmberActionables);
  (window.customCards = window.customCards || []).push({
    type: "ember-actionables",
    name: "Ember Actionables",
    description: "Dynamic 'what needs me now' — washer / music / timer / updates",
    preview: true,
  });
}
