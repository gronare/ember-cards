import { LitElement, html, css, svg, nothing, type TemplateResult, type SVGTemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";
import "./ember-statistics-card-editor";

export type GraphKind = "auto" | "bar" | "line" | "area";
export type Aggregation = "change" | "mean" | "min" | "max";
export type StatPeriod = "hour" | "day" | "week" | "month";
export type StatKey = "total" | "avg" | "min" | "max" | "peak";

export interface EmberStatisticsCardConfig extends LovelaceCardConfig {
  entity?: string; // a statistic_id: an entity (sensor.x) OR external stat like "curves:electricity_daily"
  statistic_id?: string; // alias for entity
  name?: string;
  icon?: string;
  unit?: string; // override; else from statistic metadata
  graph?: GraphKind; // default "auto"
  aggregation?: Aggregation; // default: auto (change when has_sum, else mean)
  period?: StatPeriod; // default "day"
  days?: number; // default 30
  color?: string; // "amber" | "teal" | "green" | hex; default "amber"
  stats?: StatKey[]; // footer chips
  show_period_selector?: boolean; // default true
}

// --- HA statistics WS shapes (not in custom-card-helpers) --------------------
interface StatMeta {
  statistic_id: string;
  has_sum: boolean;
  statistics_unit_of_measurement?: string | null;
  display_unit_of_measurement?: string | null;
  name?: string | null;
  unit_class?: string | null;
}
interface StatRow {
  start: number | string;
  end: number | string;
  change?: number | null;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  state?: number | null;
  sum?: number | null;
}
// custom-card-helpers types callWS, but narrow it here so the calls stay typed.
type HassWS = HomeAssistant & {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
};

type RangeKey = "day" | "week" | "month" | "year";
const RANGES: Record<RangeKey, { period: StatPeriod; days: number; cap: string }> = {
  day: { period: "hour", days: 1, cap: "Today · 24 h" },
  week: { period: "day", days: 7, cap: "This week" },
  month: { period: "day", days: 31, cap: "This month" },
  year: { period: "month", days: 366, cap: "Last 12 months" },
};

const DAY_MS = 86400000;

const fmt = (v: number, dp: number): string => v.toFixed(dp);

// Top-rounded bar anchored to the baseline (mirrors the mockup's barPath).
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h} Z`;
}

// A single measurement / historical-statistic chart. First data-fetching card:
// pulls HA long-term statistics via the recorder WS API and renders bars for
// cumulative stats (has_sum) or a line+area for measurements, in the ember style.
export class EmberStatisticsCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberStatisticsCardConfig;
  @state() private meta?: StatMeta | null; // undefined = not fetched, null = fetched/not found
  @state() private rows?: StatRow[]; // undefined = not fetched
  @state() private range: RangeKey = "month";
  @state() private chartWidth = 0;
  @state() private tip?: { x: number; y: number; label: string; text: string };

  private metaStatId?: string;
  private seriesKey?: string;
  private ro?: ResizeObserver;

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .chead {
        display: flex;
        align-items: center;
        gap: 11px;
        flex-wrap: wrap;
        row-gap: 9px;
      }
      .chead ha-icon {
        --mdc-icon-size: 26px;
        color: var(--ember-accent);
        flex: none;
      }
      .title {
        font-size: 19px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--primary-text-color);
      }
      .chips {
        margin-left: auto;
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .chip {
        font-family: var(--ember-mono);
        font-size: 10.5px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 4px 9px;
        cursor: pointer;
        transition: 0.15s;
      }
      .chip:hover {
        color: var(--primary-text-color);
        background: rgba(127, 140, 150, 0.12);
      }
      .chip[aria-pressed="true"] {
        color: var(--ember-accent);
        background: var(--ember-accent-bg);
        border-color: color-mix(in srgb, var(--ember-accent) 40%, transparent);
      }
      .hero {
        display: flex;
        align-items: baseline;
        gap: 12px;
        flex-wrap: wrap;
        min-height: 34px;
      }
      .hero .num {
        font-family: var(--ember-mono);
        font-size: 34px;
        font-weight: 600;
        line-height: 0.9;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .hero .unit {
        font-family: var(--ember-mono);
        font-size: 14px;
        color: var(--secondary-text-color);
      }
      .delta {
        font-family: var(--ember-mono);
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--secondary-text-color);
        background: rgba(127, 140, 150, 0.12);
        border-radius: 999px;
        padding: 3px 8px;
      }
      .hero .cap {
        margin-left: auto;
        color: var(--secondary-text-color);
        font-size: 12px;
        font-family: var(--ember-mono);
      }
      .chart {
        width: 100%;
        height: 132px;
        position: relative;
      }
      .chart svg {
        display: block;
      }
      .msg {
        color: var(--secondary-text-color);
        font-size: 13px;
        font-family: var(--ember-mono);
        display: flex;
        align-items: center;
        height: 100%;
      }
      .stats {
        display: flex;
        gap: 22px;
        border-top: 1px solid var(--divider-color);
        padding-top: 12px;
        flex-wrap: wrap;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .stat .k {
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        font-family: var(--ember-mono);
      }
      .stat .v {
        font-size: 15px;
        font-family: var(--ember-mono);
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
      }
      .tip {
        position: absolute;
        pointer-events: none;
        z-index: 5;
        transform: translate(-50%, -118%);
        background: var(--card-background-color, #24252b);
        border: 1px solid var(--divider-color);
        border-radius: 9px;
        padding: 7px 10px;
        font-family: var(--ember-mono);
        font-size: 11.5px;
        color: var(--primary-text-color);
        white-space: nowrap;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      }
      .tip .td {
        color: var(--secondary-text-color);
        font-size: 10px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 2px;
      }
      .tip b {
        font-weight: 600;
      }
    `,
  ];

  setConfig(config: EmberStatisticsCardConfig): void {
    const statId = config.entity ?? config.statistic_id;
    if (statId !== this.statId) {
      // Statistic changed → drop cached data so the new one refetches.
      this.meta = undefined;
      this.rows = undefined;
      this.metaStatId = undefined;
      this.seriesKey = undefined;
    }
    this.config = config;
    this.range = this.defaultRange(config);
  }

  getCardSize(): number {
    return 4;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("ember-statistics-card-editor");
  }

  static getStubConfig(): Omit<EmberStatisticsCardConfig, "type"> {
    return { graph: "auto", period: "day", days: 30 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Re-measure if reattached (observer is torn down on disconnect).
    this.updateComplete.then(() => this.observeChart());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
    this.ro = undefined;
  }

  firstUpdated(): void {
    this.observeChart();
  }

  updated(): void {
    this.maybeFetch();
  }

  private observeChart(): void {
    if (this.ro) return;
    const box = this.renderRoot?.querySelector(".chart") as HTMLElement | null;
    if (!box) return;
    this.ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w && w !== this.chartWidth) this.chartWidth = w;
    });
    this.ro.observe(box);
  }

  private get statId(): string | undefined {
    return this.config?.entity ?? this.config?.statistic_id;
  }

  private defaultRange(config: EmberStatisticsCardConfig): RangeKey {
    if (config.show_period_selector === false) return "month";
    switch (config.period) {
      case "hour":
        return "day";
      case "month":
      case "week":
        return "year";
      case "day":
        return (config.days ?? 30) <= 10 ? "week" : "month";
      default:
        return "month";
    }
  }

  private effectiveRange(): { period: StatPeriod; days: number; cap: string } {
    if (this.config?.show_period_selector === false) {
      const period = this.config.period ?? "day";
      const days = this.config.days ?? 30;
      return { period, days, cap: this.capFor(period, days) };
    }
    return RANGES[this.range];
  }

  private capFor(period: StatPeriod, days: number): string {
    if (period === "hour") return "Today · 24 h";
    if (period === "month") return "Last 12 months";
    return `Last ${days} days`;
  }

  private maybeFetch(): void {
    const hass = this.hass as HassWS | undefined;
    const statId = this.statId;
    if (!hass || !statId) return;

    if (this.metaStatId !== statId) {
      this.metaStatId = statId;
      void this.fetchMeta(statId, hass);
    }

    const { period, days } = this.effectiveRange();
    const key = `${statId}|${period}|${days}`;
    if (this.seriesKey !== key) {
      this.seriesKey = key;
      void this.fetchSeries(statId, period, days, hass);
    }
  }

  private async fetchMeta(statId: string, hass: HassWS): Promise<void> {
    try {
      const all = await hass.callWS<StatMeta[]>({ type: "recorder/list_statistic_ids" });
      if (this.metaStatId !== statId) return; // stale
      this.meta = all.find((m) => m.statistic_id === statId) ?? null;
    } catch {
      if (this.metaStatId !== statId) return;
      this.meta = null;
    }
  }

  private async fetchSeries(
    statId: string,
    period: StatPeriod,
    days: number,
    hass: HassWS
  ): Promise<void> {
    const key = `${statId}|${period}|${days}`;
    const end = new Date();
    const start = new Date(end.getTime() - days * DAY_MS);
    try {
      const res = await hass.callWS<Record<string, StatRow[]>>({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: [statId],
        period,
        types: ["change", "mean", "min", "max", "state", "sum"],
      });
      if (this.seriesKey !== key) return; // stale
      this.rows = res[statId] ?? [];
    } catch {
      if (this.seriesKey !== key) return;
      this.rows = [];
    }
  }

  // --- derived ---------------------------------------------------------------
  private get hasSum(): boolean {
    return this.meta?.has_sum ?? false;
  }

  private get unit(): string {
    return (
      this.config?.unit ??
      this.meta?.display_unit_of_measurement ??
      this.meta?.statistics_unit_of_measurement ??
      ""
    );
  }

  private get dp(): number {
    return this.unit === "%" ? 0 : 1;
  }

  private get aggregation(): Aggregation {
    return this.config?.aggregation ?? (this.hasSum ? "change" : "mean");
  }

  private get resolvedGraph(): "bar" | "line" | "area" {
    const g = this.config?.graph ?? "auto";
    if (g === "auto") return this.hasSum ? "bar" : "area";
    return g;
  }

  private accentVar(): string {
    const c = this.config?.color ?? "amber";
    if (c === "amber") return "var(--ember-accent)";
    if (c === "teal") return "var(--ember-teal)";
    if (c === "green") return "var(--ember-good)";
    return c; // literal hex / css color
  }

  private accentStrongVar(): string {
    const c = this.config?.color ?? "amber";
    if (c === "amber") return "var(--ember-accent-strong)";
    return this.accentVar();
  }

  // Override the accent tokens ONLY for a non-default colour. For "amber" we
  // must NOT set `--ember-accent: var(--ember-accent)` — that is a self-cycle
  // that invalidates the variable and drops SVG fills to black.
  private colorOverride(): string {
    const c = this.config?.color;
    if (!c || c === "amber") return "";
    const v = this.accentVar();
    return `--ember-accent:${v};--ember-accent-strong:${v}`;
  }

  private bucketValue(row: StatRow): number | null {
    let v: number | null | undefined;
    switch (this.aggregation) {
      case "change":
        v = row.change;
        break;
      case "mean":
        v = row.mean ?? row.state;
        break;
      case "min":
        v = row.min;
        break;
      case "max":
        v = row.max;
        break;
    }
    return v == null ? null : Number(v);
  }

  private series(): { values: number[]; labels: string[] } {
    const rows = this.rows ?? [];
    const { period } = this.effectiveRange();
    const values: number[] = [];
    const labels: string[] = [];
    for (const row of rows) {
      const v = this.bucketValue(row);
      if (v == null || Number.isNaN(v)) continue;
      values.push(v);
      labels.push(this.fmtLabel(row.start, period));
    }
    return { values, labels };
  }

  private fmtLabel(start: number | string, period: StatPeriod): string {
    const ts = typeof start === "number" ? start : Date.parse(start);
    const d = new Date(ts);
    if (period === "hour") return String(d.getHours()).padStart(2, "0");
    if (period === "month") return d.toLocaleDateString(undefined, { month: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // --- events ----------------------------------------------------------------
  private pickRange(r: RangeKey): void {
    this.range = r; // updated() → maybeFetch() refetches for the new window
  }

  private showTip(x: number, y: number, label: string, value: number): void {
    this.tip = { x, y, label, text: `${fmt(value, this.dp)}${this.unit ? " " + this.unit : ""}` };
  }

  private clearTip(): void {
    this.tip = undefined;
  }

  // --- render ----------------------------------------------------------------
  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const statId = this.statId;
    const title = this.config.name ?? this.meta?.name ?? statId ?? "Statistic";
    const icon = this.config.icon ?? (this.hasSum ? "mdi:lightning-bolt" : "mdi:chart-line");
    const showChips = this.config.show_period_selector !== false;

    const loading = this.meta === undefined || this.rows === undefined || !statId;
    const { values, labels } = loading ? { values: [], labels: [] } : this.series();
    const empty = !loading && values.length === 0;

    return html`
      <ha-card style=${this.colorOverride()}>
        <div class="chead">
          <ha-icon .icon=${icon}></ha-icon>
          <span class="title">${title}</span>
          ${showChips
            ? html`<div class="chips">
                ${(["day", "week", "month", "year"] as RangeKey[]).map(
                  (r) => html`<button
                    class="chip"
                    aria-pressed=${this.range === r ? "true" : "false"}
                    @click=${() => this.pickRange(r)}
                  >
                    ${r}
                  </button>`
                )}
              </div>`
            : nothing}
        </div>

        ${loading ? this.renderHeroPlaceholder() : empty ? nothing : this.renderHero(values)}

        <div class="chart">
          ${loading
            ? html`<div class="msg">Loading…</div>`
            : empty
              ? html`<div class="msg">No data for this period</div>`
              : this.chartWidth > 0
                ? this.renderChart(values, labels)
                : nothing}
          ${this.tip
            ? html`<div class="tip" style="left:${this.tip.x}px;top:${this.tip.y}px">
                <div class="td">${this.tip.label}</div>
                <b>${this.tip.text}</b>
              </div>`
            : nothing}
        </div>

        ${loading || empty ? nothing : this.renderStats(values)}
      </ha-card>
    `;
  }

  private renderHeroPlaceholder(): TemplateResult {
    return html`<div class="hero"><span class="num">—</span></div>`;
  }

  private renderHero(values: number[]): TemplateResult {
    const n = values.length;
    const unit = this.unit;
    const cap = this.effectiveRange().cap;
    if (this.hasSum) {
      const total = values.reduce((a, b) => a + b, 0);
      return html`<div class="hero">
        <span class="num">${fmt(total, this.dp)}</span>
        ${unit ? html`<span class="unit">${unit}</span>` : nothing}
        <span class="cap">${cap}</span>
      </div>`;
    }
    const last = values[n - 1];
    const first = values[0];
    const diff = last - first;
    const up = diff >= 0;
    // Neutral delta: arrow + magnitude only, secondary ink — never coloured
    // good/bad (a temperature rise is not "bad").
    return html`<div class="hero">
      <span class="num">${fmt(last, this.dp)}${unit === "°" ? "°" : ""}</span>
      ${unit && unit !== "°" ? html`<span class="unit">${unit}</span>` : nothing}
      <span class="delta"
        ><span class="ar">${up ? "▲" : "▼"}</span> ${fmt(Math.abs(diff), this.dp)}${unit === "°"
          ? "°"
          : unit
            ? " " + unit
            : ""}</span
      >
      <span class="cap">Now · ${cap}</span>
    </div>`;
  }

  private renderStats(values: number[]): TemplateResult {
    const n = values.length;
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / n;
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const valueByKey: Record<StatKey, number> = {
      total,
      avg,
      min: mn,
      max: mx,
      peak: mx,
    };
    const labelByKey: Record<StatKey, string> = {
      total: "Total",
      avg: this.hasSum ? "Daily avg" : "Avg",
      min: "Min",
      max: "Max",
      peak: "Peak",
    };
    const keys: StatKey[] =
      this.config?.stats ?? (this.hasSum ? ["total", "avg", "peak"] : ["min", "avg", "max"]);
    const unitSuffix = this.unit === "°" ? "°" : "";
    return html`<div class="stats">
      ${keys.map(
        (k) => html`<div class="stat">
          <span class="k">${labelByKey[k]}</span>
          <span class="v">${fmt(valueByKey[k], this.dp)}${unitSuffix}</span>
        </div>`
      )}
    </div>`;
  }

  private renderChart(values: number[], labels: string[]): SVGTemplateResult {
    const W = this.chartWidth;
    const H = 132;
    const pad = { l: 6, r: 6, t: 16, b: 20 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const baseY = pad.t + plotH;
    const n = values.length;
    const accent = this.accentVar();
    const gridStroke = "var(--divider-color)";

    // Faint gridlines.
    const gridN = 3;
    const grid: SVGTemplateResult[] = [];
    for (let g = 1; g <= gridN; g++) {
      const gy = pad.t + (plotH * g) / (gridN + 1);
      grid.push(
        svg`<line x1=${pad.l} y1=${gy} x2=${W - pad.r} y2=${gy} stroke=${gridStroke} stroke-width="1" opacity="0.5"></line>`
      );
    }

    // Evenly-spaced label indices, always including first + last, so ticks
    // never bunch up or collide near the right edge on wide windows.
    const target = W < 360 ? 4 : 6;
    const cnt = Math.min(n, target);
    const labelSet = new Set<number>();
    for (let k = 0; k < cnt; k++) labelSet.add(Math.round((k * (n - 1)) / Math.max(1, cnt - 1)));
    const tick = (i: number, x: number): SVGTemplateResult => {
      const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      const tx = i === 0 ? pad.l : i === n - 1 ? W - pad.r : x;
      return svg`<text x=${tx} y=${H - 6} text-anchor=${anchor}
        style="font-family:var(--ember-mono);font-size:9.5px;fill:var(--secondary-text-color)"
      >${labels[i]}</text>`;
    };

    if (this.resolvedGraph === "bar") {
      const max = Math.max(...values) * 1.14 || 1;
      const gap = Math.max(2, Math.min(6, (plotW / n) * 0.22));
      const bw = (plotW - gap * (n - 1)) / n;
      const avg = values.reduce((a, b) => a + b, 0) / n;
      const ay = baseY - (avg / max) * plotH;
      const strong = this.accentStrongVar();
      const bars: SVGTemplateResult[] = [];
      const ticks: SVGTemplateResult[] = [];
      values.forEach((val, i) => {
        const bh = Math.max(1, (val / max) * plotH);
        const x = pad.l + i * (bw + gap);
        const y = baseY - bh;
        const last = i === n - 1;
        bars.push(
          svg`<path d=${barPath(x, y, bw, bh, 4)}
            style=${`fill:${last ? strong : accent};fill-opacity:${last ? 1 : 0.82};cursor:pointer`}
            @mousemove=${() => this.showTip(x + bw / 2, y, labels[i], val)}
            @mouseleave=${() => this.clearTip()}
          ></path>`
        );
        if (labelSet.has(i)) ticks.push(tick(i, x + bw / 2));
      });
      return svg`<svg width=${W} height=${H}>
        ${grid}
        ${bars}
        <line x1=${pad.l} y1=${ay} x2=${W - pad.r} y2=${ay}
          style=${`stroke:${accent}`} stroke-width="1" stroke-dasharray="2 4" opacity="0.55"></line>
        <text x=${W - pad.r} y=${ay - 4} text-anchor="end"
          style=${`font-family:var(--ember-mono);font-size:9px;fill:${accent};opacity:0.8`}>avg</text>
        ${ticks}
      </svg>`;
    }

    // line / area
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const span = mx - mn || 1;
    const padY = span * 0.25;
    const lo = mn - padY;
    const hi = mx + padY;
    const X = (i: number): number => (n === 1 ? pad.l + plotW / 2 : pad.l + (plotW * i) / (n - 1));
    const Y = (val: number): number => baseY - ((val - lo) / (hi - lo)) * plotH;

    let d = "";
    values.forEach((val, i) => {
      d += (i ? "L" : "M") + X(i) + " " + Y(val) + " ";
    });
    const areaD = d + `L${X(n - 1)} ${baseY} L${X(0)} ${baseY} Z`;
    const drawArea = this.resolvedGraph === "area";
    const gradId = "ember-stat-grad";

    const marks: SVGTemplateResult[] = [];
    const ticks: SVGTemplateResult[] = [];
    values.forEach((val, i) => {
      const x = X(i);
      const y = Y(val);
      // Transparent fat hit-target for hover.
      marks.push(
        svg`<circle cx=${x} cy=${y} r="9" fill="transparent" style="cursor:pointer"
          @mousemove=${() => this.showTip(x, y, labels[i], val)}
          @mouseleave=${() => this.clearTip()}
        ></circle>`
      );
      if (labelSet.has(i)) ticks.push(tick(i, x));
    });
    const ex = X(n - 1);
    const ey = Y(values[n - 1]);

    return svg`<svg width=${W} height=${H}>
      <defs>
        <linearGradient id=${gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style=${`stop-color:${accent}`} stop-opacity="0.28"></stop>
          <stop offset="1" style=${`stop-color:${accent}`} stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${grid}
      ${drawArea ? svg`<path d=${areaD} fill=${`url(#${gradId})`}></path>` : nothing}
      <path d=${d} fill="none" style=${`stroke:${accent}`} stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"></path>
      ${marks}
      <circle cx=${ex} cy=${ey} r="4.5" fill="var(--card-background-color, #1a1b20)"
        style=${`stroke:${accent}`} stroke-width="2.5"></circle>
      ${ticks}
    </svg>`;
  }
}

if (!customElements.get("ember-statistics-card")) {
  customElements.define("ember-statistics-card", EmberStatisticsCard);
  (window.customCards = window.customCards || []).push({
    type: "ember-statistics-card",
    name: "Ember Statistics",
    description: "Historical chart for any statistic (energy, climate, …)",
    preview: true,
  });
}
