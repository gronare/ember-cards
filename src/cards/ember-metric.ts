import { LitElement, html, css, svg, nothing, type TemplateResult, type SVGTemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-metric-editor";

export type MetricPeriod = "today" | "yesterday" | "week" | "month";
export type MetricAgg = "change" | "mean" | "min" | "max";
export type MetricCompare = "norm" | "previous" | "none";

export interface EmberMetricConfig extends LovelaceCardConfig {
  entity?: string;
  statistic_id?: string;
  name?: string;
  icon?: string;
  unit?: string;
  color?: string; // amber | teal | green | hex
  period?: MetricPeriod; // default first of `periods`
  periods?: MetricPeriod[]; // which periods the chip cycles through; default all
  aggregation?: MetricAgg; // default: change if has_sum else mean
  compare?: MetricCompare; // delta basis; default "norm"
  norm_samples?: number; // history samples for the norm; default 8
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
const ALL_PERIODS: MetricPeriod[] = ["today", "yesterday", "week", "month"];
// stat granularity + fetch window (days) per period. Windows are wide enough to
// gather ~8 comparable historical buckets for the norm.
const PCFG: Record<MetricPeriod, { stat: "day" | "week" | "month"; win: number }> = {
  today: { stat: "day", win: 75 },
  yesterday: { stat: "day", win: 75 },
  week: { stat: "week", win: 84 },
  month: { stat: "month", win: 340 },
};
const LABEL: Record<MetricPeriod, string> = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month" };
const fmt = (v: number, dp: number): string => v.toFixed(dp);
const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

interface Computed {
  value: number | null;
  partial: boolean; // target period is the current (incomplete) one
  delta: number | null; // shown only for a complete target
  vs: string;
  spark: number[];
}

// Compact single-value statistic tile (air-quality sized). One number for a
// period + an honest comparison: complete periods (yesterday) show a delta vs
// the norm for that weekday; current partial periods show the running value
// only. "Today" honestly reports no data when the provider hasn't posted it.
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
        user-select: none;
      }
      .period.static {
        cursor: default;
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
    const avail = this.periodList(config);
    const want = config.period ?? avail[0];
    this.period = avail.includes(want) ? want : avail[0];
  }
  getCardSize(): number {
    return 2;
  }
  static getConfigElement(): HTMLElement {
    return document.createElement("ember-metric-editor");
  }
  static getStubConfig(): Omit<EmberMetricConfig, "type"> {
    return { period: "yesterday", compare: "norm", show_sparkline: true };
  }

  private periodList(config?: EmberMetricConfig): MetricPeriod[] {
    const ps = (config ?? this.config)?.periods;
    return ps && ps.length ? ps : ALL_PERIODS;
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

  private aggVal(row: StatRow): number | null {
    let v: number | null | undefined;
    if (this.agg === "change") v = row.change;
    else if (this.agg === "mean") v = row.mean ?? row.state;
    else if (this.agg === "min") v = row.min;
    else v = row.max;
    return v == null || Number.isNaN(+v) ? null : +v;
  }

  private points(): { ts: Date; val: number }[] {
    const out: { ts: Date; val: number }[] = [];
    for (const row of this.rows ?? []) {
      const v = this.aggVal(row);
      if (v == null) continue;
      const ts = typeof row.start === "number" ? new Date(row.start) : new Date(Date.parse(row.start));
      out.push({ ts, val: v });
    }
    out.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    return out;
  }

  private compute(): Computed {
    const period = this.period;
    const compare = this.config?.compare ?? "norm";
    const samples = this.config?.norm_samples ?? 8;
    const pts = this.points();
    const now = new Date();

    if (period === "today" || period === "yesterday") {
      const targetDate = startOfDay(period === "today" ? now : new Date(now.getTime() - DAY_MS));
      const target = pts.find((p) => sameDay(p.ts, targetDate));
      const value = target ? target.val : null;
      const partial = period === "today";
      // recent same-weekday values, strictly before today, excluding the target
      const wd = targetDate.getDay();
      const sameWd = pts.filter(
        (p) => p.ts.getDay() === wd && startOfDay(p.ts) < startOfDay(now) && !sameDay(p.ts, targetDate)
      );
      const normVals = sameWd.slice(-samples).map((p) => p.val);
      let delta: number | null = null;
      let vs = "";
      if (value != null && !partial) {
        if (compare === "norm" && normVals.length) {
          delta = value - mean(normVals);
          vs = "vs typ. " + targetDate.toLocaleDateString(undefined, { weekday: "short" });
        } else if (compare === "previous") {
          const idx = pts.findIndex((p) => sameDay(p.ts, targetDate));
          if (idx > 0) {
            delta = value - pts[idx - 1].val;
            vs = "vs prev day";
          }
        }
      }
      const spark = [...sameWd.slice(-(samples - 1)).map((p) => p.val), ...(value != null ? [value] : [])];
      return { value, partial, delta, vs, spark };
    }

    // week / month → the last bucket is the current (partial) period
    const value = pts.length ? pts[pts.length - 1].val : null;
    const prev = pts.slice(0, -1).map((p) => p.val);
    let delta: number | null = null;
    let vs = "";
    if (compare === "previous" && value != null && prev.length) {
      delta = value - prev[prev.length - 1];
      vs = period === "week" ? "vs last week" : "vs last month";
    }
    // (norm comparison for a *partial* week/month would be misleading, so skip)
    const spark = pts.slice(-samples).map((p) => p.val);
    return { value, partial: true, delta, vs, spark };
  }

  private cyclePeriod(e: Event): void {
    e.stopPropagation();
    const list = this.periodList();
    if (list.length < 2) return;
    this.period = list[(list.indexOf(this.period) + 1) % list.length];
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
    const statId = this.statId;
    const title = this.config.name ?? this.meta?.name ?? statId ?? "Metric";
    const icon = this.config.icon ?? (this.hasSum ? "mdi:lightning-bolt" : "mdi:gauge");
    const loading = this.meta === undefined || this.rows === undefined || !statId;
    const multi = this.periodList().length > 1;

    const c: Computed = loading ? { value: null, partial: false, delta: null, vs: "", spark: [] } : this.compute();
    const unit = this.unit;
    const up = (c.delta ?? 0) >= 0;
    const spark = this.config.show_sparkline === false ? [] : c.spark;

    // sub-line: delta for complete periods; "so far" for partial current; else state
    let sub: TemplateResult;
    if (c.delta != null) {
      sub = html`<span class="delta">${up ? "▲" : "▼"} ${fmt(Math.abs(c.delta), this.dp)}${unit ? " " + unit : ""}</span>
        <span class="vs">${c.vs}</span>`;
    } else if (loading) {
      sub = html`<span class="vs">loading…</span>`;
    } else if (c.value == null) {
      sub = html`<span class="vs">${this.period === "today" ? "no data yet" : "no data"}</span>`;
    } else if (c.partial) {
      sub = html`<span class="vs">so far</span>`;
    } else {
      sub = html`<span class="vs"></span>`;
    }

    return html`
      <ha-card style=${this.colorOverride()}>
        <div class="head">
          <ha-icon .icon=${icon}></ha-icon>
          <span class="t">${title}</span>
          <span class="period ${multi ? "" : "static"}" @click=${(e: Event) => this.cyclePeriod(e)}
            >${LABEL[this.period]}${multi ? " ▾" : ""}</span
          >
        </div>
        <div class="big">
          <span class="num">${loading || c.value == null ? "—" : fmt(c.value, this.dp)}</span>
          ${unit ? html`<span class="unit">${unit}</span>` : nothing}
        </div>
        <div class="sub2">${sub}${spark.length >= 2 ? html`<span class="spark">${this.sparkline(spark)}</span>` : nothing}</div>
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
    description: "Compact single-value statistic tile (period + norm comparison)",
    preview: true,
  });
}
