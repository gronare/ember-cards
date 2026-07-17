import { LitElement, html, css, svg, nothing, type TemplateResult, type SVGTemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-metric-editor";

export type MetricPeriod = "today" | "yesterday" | "week" | "month";
export type MetricAgg = "change" | "mean" | "min" | "max";

export interface EmberMetricConfig extends LovelaceCardConfig {
  entity?: string;
  statistic_id?: string;
  name?: string;
  icon?: string;
  unit?: string;
  color?: string; // amber | teal | green | hex
  period?: MetricPeriod; // default "today"
  aggregation?: MetricAgg; // default: change if has_sum else mean
  show_sparkline?: boolean; // default true
  subtitle?: string;
}

interface StatMeta {
  statistic_id: string;
  has_sum: boolean;
  statistics_unit_of_measurement?: string | null;
  display_unit_of_measurement?: string | null;
  name?: string | null;
}
interface StatRow {
  start: number | string;
  change?: number | null;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  state?: number | null;
}
type HassWS = HomeAssistant & { callWS<T>(msg: Record<string, unknown>): Promise<T> };

const DAY_MS = 86400000;
// stat period, buckets to keep for the sparkline, which bucket is the target
// (last = current period, prev = the one before = complete), and the vs-label.
const PCFG: Record<MetricPeriod, { stat: "day" | "week" | "month"; spark: number; target: "last" | "prev"; win: number; vs: string }> = {
  today: { stat: "day", spark: 7, target: "last", win: 10, vs: "vs yesterday" },
  yesterday: { stat: "day", spark: 7, target: "prev", win: 10, vs: "vs prev day" },
  week: { stat: "week", spark: 8, target: "last", win: 75, vs: "vs last week" },
  month: { stat: "month", spark: 6, target: "last", win: 240, vs: "vs last month" },
};
const LABEL: Record<MetricPeriod, string> = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month" };
const fmt = (v: number, dp: number): string => v.toFixed(dp);

// Compact single-value statistic tile (air-quality sized): one number for a
// period (today/yesterday/this week/this month) + a delta vs the previous
// period + a small sparkline for context. The right home for "yesterday's kWh".
export class EmberMetric extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberMetricConfig;
  @state() private meta?: StatMeta | null;
  @state() private rows?: StatRow[];
  @state() private period: MetricPeriod = "today";

  private metaStatId?: string;
  private seriesKey?: string;

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: flex;
        flex-direction: column;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .head ha-icon {
        --mdc-icon-size: 22px;
        color: var(--ember-accent);
      }
      .head .t {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .period {
        margin-left: auto;
        font-family: var(--ember-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--ember-accent);
        background: var(--ember-accent-bg);
        border: 1px solid color-mix(in srgb, var(--ember-accent) 34%, transparent);
        border-radius: 999px;
        padding: 4px 10px;
        cursor: pointer;
      }
      .big {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-top: 16px;
      }
      .big .num {
        font-family: var(--ember-mono);
        font-size: 38px;
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 0.9;
        color: var(--primary-text-color);
      }
      .big .unit {
        font-family: var(--ember-mono);
        font-size: 15px;
        color: var(--secondary-text-color);
      }
      .sub2 {
        display: flex;
        align-items: center;
        gap: 11px;
        margin-top: 14px;
        min-height: 20px;
      }
      .delta {
        font-family: var(--ember-mono);
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--ember-accent-strong);
        background: var(--ember-accent-bg);
        border-radius: 999px;
        padding: 3px 9px;
      }
      .vs {
        font-family: var(--ember-mono);
        font-size: 11.5px;
        color: var(--secondary-text-color);
      }
      .spark {
        margin-left: auto;
      }
      .foot {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--divider-color);
        font-family: var(--ember-mono);
        font-size: 11px;
        color: var(--secondary-text-color);
        letter-spacing: 0.04em;
      }
    `,
  ];

  setConfig(config: EmberMetricConfig): void {
    const id = config.entity ?? config.statistic_id;
    if (id !== this.statId) {
      this.meta = undefined;
      this.rows = undefined;
      this.metaStatId = undefined;
      this.seriesKey = undefined;
    }
    this.config = config;
    this.period = config.period ?? "today";
  }
  getCardSize(): number {
    return 2;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-metric-editor");
  }
  static getStubConfig(): Omit<EmberMetricConfig, "type"> {
    return { period: "today", show_sparkline: true };
  }

  private get statId(): string | undefined {
    return this.config?.entity ?? this.config?.statistic_id;
  }

  updated(): void {
    this.maybeFetch();
  }

  private maybeFetch(): void {
    const hass = this.hass as HassWS | undefined;
    const statId = this.statId;
    if (!hass || !statId) return;
    if (this.metaStatId !== statId) {
      this.metaStatId = statId;
      void this.fetchMeta(statId, hass);
    }
    const key = `${statId}|${this.period}`;
    if (this.seriesKey !== key) {
      this.seriesKey = key;
      void this.fetchSeries(statId, this.period, key, hass);
    }
  }

  private async fetchMeta(statId: string, hass: HassWS): Promise<void> {
    try {
      const all = await hass.callWS<StatMeta[]>({ type: "recorder/list_statistic_ids" });
      if (this.metaStatId !== statId) return;
      this.meta = all.find((m) => m.statistic_id === statId) ?? null;
    } catch {
      if (this.metaStatId === statId) this.meta = null;
    }
  }

  private async fetchSeries(statId: string, period: MetricPeriod, key: string, hass: HassWS): Promise<void> {
    const cfg = PCFG[period];
    const end = new Date();
    const start = new Date(end.getTime() - cfg.win * DAY_MS);
    try {
      const res = await hass.callWS<Record<string, StatRow[]>>({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: [statId],
        period: cfg.stat,
        types: ["change", "mean", "min", "max", "state"],
      });
      if (this.seriesKey !== key) return;
      this.rows = res[statId] ?? [];
    } catch {
      if (this.seriesKey === key) this.rows = [];
    }
  }

  private get hasSum(): boolean {
    return this.meta?.has_sum ?? false;
  }
  private get unit(): string {
    return this.config?.unit ?? this.meta?.display_unit_of_measurement ?? this.meta?.statistics_unit_of_measurement ?? "";
  }
  private get dp(): number {
    return this.unit === "%" ? 0 : 1;
  }
  private get agg(): MetricAgg {
    return this.config?.aggregation ?? (this.hasSum ? "change" : "mean");
  }
  private accent(): string {
    const c = this.config?.color ?? "amber";
    if (c === "amber") return "var(--ember-accent)";
    if (c === "teal") return "var(--ember-teal)";
    if (c === "green") return "var(--ember-good)";
    return c;
  }
  private colorOverride(): string {
    const c = this.config?.color;
    if (!c || c === "amber") return "";
    const v = this.accent();
    return `--ember-accent:${v};--ember-accent-strong:${v};--ember-accent-bg:color-mix(in srgb, ${v} 15%, transparent)`;
  }

  private values(): number[] {
    const rows = this.rows ?? [];
    const out: number[] = [];
    for (const row of rows) {
      let v: number | null | undefined;
      if (this.agg === "change") v = row.change;
      else if (this.agg === "mean") v = row.mean ?? row.state;
      else if (this.agg === "min") v = row.min;
      else v = row.max;
      if (v == null || Number.isNaN(+v)) continue;
      out.push(+v);
    }
    return out;
  }

  private cyclePeriod(e: Event): void {
    e.stopPropagation();
    const order: MetricPeriod[] = ["today", "yesterday", "week", "month"];
    this.period = order[(order.indexOf(this.period) + 1) % order.length];
  }

  private sparkline(vals: number[]): SVGTemplateResult | typeof nothing {
    if (vals.length < 2) return nothing;
    const W = 128, H = 36, pad = 4;
    const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
    const n = vals.length;
    const X = (i: number): number => pad + ((W - 2 * pad) * i) / (n - 1);
    const Y = (v: number): number => H - pad - ((v - mn) / sp) * (H - 2 * pad - 2) - 1;
    let d = "";
    vals.forEach((v, i) => (d += (i ? "L" : "M") + X(i) + " " + Y(v) + " "));
    const a = this.accent();
    return svg`<svg width="128" height="36" viewBox="0 0 128 36">
      <defs><linearGradient id="ember-metric-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style=${`stop-color:${a}`} stop-opacity="0.30"></stop>
        <stop offset="1" style=${`stop-color:${a}`} stop-opacity="0"></stop>
      </linearGradient></defs>
      <path d=${d + `L${X(n - 1)} ${H - pad} L${X(0)} ${H - pad} Z`} fill="url(#ember-metric-grad)"></path>
      <path d=${d} fill="none" style=${`stroke:${a}`} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"></path>
      <circle cx=${X(n - 1)} cy=${Y(vals[n - 1])} r="3" fill="var(--card-background-color,#17181c)" style=${`stroke:${a}`} stroke-width="2"></circle>
    </svg>`;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const cfg = PCFG[this.period];
    const statId = this.statId;
    const title = this.config.name ?? this.meta?.name ?? statId ?? "Metric";
    const icon = this.config.icon ?? (this.hasSum ? "mdi:lightning-bolt" : "mdi:gauge");
    const loading = this.meta === undefined || this.rows === undefined || !statId;

    const vals = loading ? [] : this.values();
    const n = vals.length;
    const ti = cfg.target === "prev" ? n - 2 : n - 1;
    const has = ti >= 0;
    const value = has ? vals[ti] : null;
    const delta = has && ti - 1 >= 0 ? value! - vals[ti - 1] : null;
    const sparkEnd = ti + 1;
    const spark = this.config.show_sparkline === false ? [] : vals.slice(Math.max(0, sparkEnd - cfg.spark), sparkEnd);
    const unit = this.unit;
    const up = (delta ?? 0) >= 0;

    return html`
      <ha-card style=${this.colorOverride()}>
        <div class="head">
          <ha-icon .icon=${icon}></ha-icon>
          <span class="t">${title}</span>
          <span class="period" @click=${(e: Event) => this.cyclePeriod(e)}>${LABEL[this.period]} ▾</span>
        </div>
        <div class="big">
          <span class="num">${loading ? "—" : value == null ? "—" : fmt(value, this.dp)}</span>
          ${unit ? html`<span class="unit">${unit}</span>` : nothing}
        </div>
        <div class="sub2">
          ${delta != null
            ? html`<span class="delta">${up ? "▲" : "▼"} ${fmt(Math.abs(delta), this.dp)}${unit ? " " + unit : ""}</span>
                <span class="vs">${cfg.vs}</span>`
            : html`<span class="vs">${loading ? "loading…" : value == null ? "no data" : ""}</span>`}
          ${spark.length ? html`<span class="spark">${this.sparkline(spark)}</span>` : nothing}
        </div>
        ${this.config.subtitle ? html`<div class="foot">${this.config.subtitle}</div>` : nothing}
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-metric")) {
  customElements.define("ember-metric", EmberMetric);
  (window.customCards = window.customCards || []).push({
    type: "ember-metric",
    name: "Ember Metric",
    description: "Compact single-value statistic tile (today/yesterday/week/month)",
    preview: true,
  });
}
