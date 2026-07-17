import { LitElement, html, css, svg, nothing, type TemplateResult, type SVGTemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens } from "../shared/theme";

export interface DetailThreshold {
  value: number;
  color: string; // warn | alert | good | teal | hex
}
export interface DetailMetric {
  entity: string;
  name: string;
  unit?: string;
  color?: string; // amber | teal | green | hex ; default alternates amber/teal
  decimals?: number;
  thresholds?: DetailThreshold[];
}
export interface DetailStatus {
  entity: string;
  colors?: Record<string, string>; // state -> good|warn|alert|hex
}
export interface EmberSensorDetailConfig extends LovelaceCardConfig {
  hash: string;
  name?: string;
  icon?: string;
  subtitle?: string;
  status?: DetailStatus;
  metrics: DetailMetric[];
}

interface Pt {
  ts: Date;
  val: number;
}
type HassWS = HomeAssistant & { callWS<T>(msg: Record<string, unknown>): Promise<T> };

const WIN_H = 26; // hours fetched (~24 hourly buckets)
const resolveColor = (c?: string, fallback = "var(--ember-accent)"): string => {
  if (!c) return fallback;
  if (c === "amber") return "var(--ember-accent)";
  if (c === "teal") return "var(--ember-teal)";
  if (c === "green" || c === "good") return "var(--ember-good)";
  if (c === "warn") return "var(--ember-warn)";
  if (c === "alert") return "var(--ember-alert)";
  return c;
};
const pad2 = (n: number): string => ("0" + n).slice(-2);

// One reusable tap-to-open detail popup: a hash overlay (room-detail shell) with
// N stacked metric blocks, each = current value + a last-24h hourly line/area
// chart + min/avg/max chips. Serves the air-quality popup (PM2.5 + CO2) and the
// per-room climate popups (temp + humidity). Designed by fable; see vault.
export class EmberSensorDetail extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberSensorDetailConfig;
  @state() private open = false;
  @state() private data: Record<string, Pt[]> = {};
  @state() private width = 0;
  @state() private tip?: { mi: number; x: number; y: number; label: string; text: string };

  private onHash = () => this.sync();
  private loadedKey?: string;
  private ro?: ResizeObserver;

  static styles = [
    emberTokens,
    css`
      :host {
        display: contents;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 8;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 5vh 12px;
        overflow-y: auto;
      }
      .panel {
        width: 100%;
        max-width: 520px;
        background: var(--card-background-color, #17181c);
        border-radius: 24px;
        padding: 24px;
        box-sizing: border-box;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .head .chip {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(127, 140, 150, 0.14);
      }
      .head .tt {
        flex: 1;
        min-width: 0;
      }
      .head .title {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .head .sub {
        font-family: var(--ember-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .pill {
        font-family: var(--ember-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-radius: 999px;
        padding: 4px 10px;
      }
      .close {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: none;
        background: rgba(255, 255, 255, 0.05);
        color: var(--primary-text-color);
        cursor: pointer;
        display: grid;
        place-items: center;
        flex: none;
      }
      .close:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .caption {
        display: flex;
        justify-content: space-between;
        margin-top: 18px;
        font-family: var(--ember-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .block {
        padding: 18px 0 20px;
        border-top: 1px solid var(--divider-color);
        margin-top: 8px;
      }
      .block:first-of-type {
        border-top: none;
      }
      .lrow {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .lname {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--ember-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .cur {
        font-family: var(--ember-mono);
        font-variant-numeric: tabular-nums;
      }
      .cur .v {
        font-size: 24px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .cur .u {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-left: 3px;
      }
      .chart {
        position: relative;
        margin-top: 10px;
        width: 100%;
        height: 128px;
      }
      .chart svg {
        display: block;
      }
      .msg {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        font-family: var(--ember-mono);
        font-size: 13px;
        color: var(--secondary-text-color);
      }
      .tip {
        position: absolute;
        pointer-events: none;
        transform: translate(-50%, -120%);
        background: #1f2126;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 6px 9px;
        font-family: var(--ember-mono);
        font-size: 11px;
        color: var(--primary-text-color);
        white-space: nowrap;
        z-index: 3;
      }
      .chips {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
      }
      .stat {
        display: inline-flex;
        gap: 6px;
        align-items: baseline;
        border: 1px solid var(--divider-color);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 999px;
        padding: 4px 10px;
        font-family: var(--ember-mono);
        font-size: 11px;
      }
      .stat .k {
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .stat .v {
        font-weight: 600;
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
      }
    `,
  ];

  setConfig(config: EmberSensorDetailConfig): void {
    if (!config.hash) throw new Error("ember-sensor-detail: 'hash' is required");
    if (!Array.isArray(config.metrics) || !config.metrics.length) throw new Error("ember-sensor-detail: 'metrics' required");
    this.config = config;
  }
  getCardSize(): number {
    return 1;
  }
  static getStubConfig(): Omit<EmberSensorDetailConfig, "type"> {
    return { hash: "#detail", name: "Detail", metrics: [] };
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
    this.sync();
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onHash);
    this.ro?.disconnect();
    this.ro = undefined;
  }
  private sync(): void {
    const open = this.config != null && window.location.hash === this.config.hash;
    this.open = open;
    if (open) this.load();
  }
  private close(): void {
    if (window.location.hash === this.config?.hash) window.history.back();
    else this.sync();
  }

  updated(): void {
    if (this.open && !this.ro) {
      const box = this.renderRoot?.querySelector(".panel") as HTMLElement | null;
      if (box) {
        this.ro = new ResizeObserver((es) => {
          const w = Math.round(es[0].contentRect.width) - 48; // minus panel padding
          if (w > 0 && w !== this.width) this.width = w;
        });
        this.ro.observe(box);
      }
    } else if (!this.open && this.ro) {
      this.ro.disconnect();
      this.ro = undefined;
    }
  }

  private async load(): Promise<void> {
    const hass = this.hass as HassWS | undefined;
    if (!hass || !this.config) return;
    const ids = this.config.metrics.map((m) => m.entity);
    const key = ids.join("|");
    if (this.loadedKey === key) return;
    this.loadedKey = key;
    const end = new Date();
    const start = new Date(end.getTime() - WIN_H * 3600000);
    try {
      const res = await hass.callWS<Record<string, Array<{ start: number | string; mean?: number | null; state?: number | null }>>>({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: ids,
        period: "hour",
        types: ["mean", "state"],
      });
      const data: Record<string, Pt[]> = {};
      for (const id of ids) {
        const rows = res[id] ?? [];
        data[id] = rows
          .map((r) => {
            const v = r.mean ?? r.state;
            const ts = typeof r.start === "number" ? new Date(r.start) : new Date(Date.parse(r.start));
            return v == null || Number.isNaN(+v) ? null : { ts, val: +v };
          })
          .filter((p): p is Pt => p != null);
      }
      this.data = data;
    } catch {
      this.data = {};
    }
  }

  private st(entity: string) {
    return this.hass?.states[entity];
  }

  // header status pill/tint from a categorical entity
  private statusColor(): string | null {
    const s = this.config?.status;
    if (!s) return null;
    const state = this.st(s.entity)?.state;
    if (!state) return null;
    return resolveColor(s.colors?.[state] ?? "good");
  }

  private updatedLabel(): string {
    let latest = 0;
    for (const m of this.config!.metrics) {
      const lu = this.st(m.entity)?.last_updated;
      if (lu) latest = Math.max(latest, Date.parse(lu));
    }
    if (!latest) return "";
    const d = new Date(latest);
    return `updated ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  private scrub(mi: number, pts: Pt[], W: number, geo: { l: number; plotW: number }, unit: string, dp: number) {
    return (ev: PointerEvent) => {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const n = pts.length;
      let i = Math.round(((x - geo.l) / geo.plotW) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const p = pts[i];
      this.tip = {
        mi,
        x: geo.l + (geo.plotW * i) / (n - 1),
        y: 0,
        label: `${pad2(p.ts.getHours())}:00`,
        text: `${p.val.toFixed(dp)}${unit ? " " + unit : ""}`,
      };
    };
  }

  private chart(mi: number, m: DetailMetric, accent: string): TemplateResult {
    const pts = this.data[m.entity] ?? [];
    const W = this.width || 460;
    if (pts.length < 2) return html`<div class="chart"><div class="msg">No data for this period</div></div>`;
    const H = 128;
    const pad = { l: 6, r: 6, t: 12, b: 20 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const baseY = pad.t + plotH;
    const n = pts.length;
    const vals = pts.map((p) => p.val);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    const spanPad = (mx - mn || 1) * 0.15;
    const lo = mn - spanPad, hi = mx + spanPad;
    const X = (i: number): number => pad.l + (plotW * i) / (n - 1);
    const Y = (v: number): number => baseY - ((v - lo) / (hi - lo)) * plotH;
    let d = "";
    pts.forEach((p, i) => (d += (i ? "L" : "M") + X(i) + " " + Y(p.val) + " "));
    const gradId = `esd-grad-${mi}`;

    const grid: SVGTemplateResult[] = [];
    for (let g = 1; g <= 3; g++) {
      const val = hi - ((hi - lo) * g) / 4;
      const gy = Y(val);
      grid.push(svg`<line x1=${pad.l} y1=${gy} x2=${W - pad.r} y2=${gy} stroke="rgba(255,255,255,0.05)" stroke-width="1"></line>`);
      grid.push(
        svg`<text x=${pad.l + 2} y=${gy - 3} style="font-family:var(--ember-mono);font-size:10px;fill:var(--secondary-text-color)">${val.toFixed(m.decimals ?? 1)}</text>`
      );
    }
    // thresholds within range
    const thr: SVGTemplateResult[] = [];
    for (const t of m.thresholds ?? []) {
      if (t.value > lo && t.value < hi) {
        const ty = Y(t.value);
        const tc = resolveColor(t.color);
        thr.push(svg`<line x1=${pad.l} y1=${ty} x2=${W - pad.r} y2=${ty} stroke=${tc} stroke-width="1" stroke-dasharray="3 3" opacity="0.7"></line>`);
        thr.push(svg`<text x=${W - pad.r} y=${ty - 3} text-anchor="end" style=${`font-family:var(--ember-mono);font-size:9px;fill:${tc}`}>${t.value}</text>`);
      }
    }
    // avg
    const avg = vals.reduce((a, b) => a + b, 0) / n;
    const ay = Y(avg);
    // x ticks: clock hours 0/6/12/18 + Now
    const ticks: SVGTemplateResult[] = [];
    pts.forEach((p, i) => {
      if (i < n - 1 && p.ts.getHours() % 6 === 0) {
        ticks.push(
          svg`<text x=${X(i)} y=${H - 5} text-anchor="middle" style="font-family:var(--ember-mono);font-size:9.5px;fill:var(--secondary-text-color)">${pad2(p.ts.getHours())}</text>`
        );
      }
    });
    ticks.push(
      svg`<text x=${W - pad.r} y=${H - 5} text-anchor="end" style="font-family:var(--ember-mono);font-size:9.5px;font-weight:600;fill:var(--primary-text-color)">Now</text>`
    );
    const ex = X(n - 1), ey = Y(pts[n - 1].val);
    const tip = this.tip && this.tip.mi === mi ? this.tip : undefined;

    return html`
      <div
        class="chart"
        @pointermove=${this.scrub(mi, pts, W, { l: pad.l, plotW }, m.unit ?? "", m.decimals ?? 1)}
        @pointerleave=${() => (this.tip = undefined)}
      >
        <svg width=${W} height=${H}>
          <defs>
            <linearGradient id=${gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style=${`stop-color:${accent}`} stop-opacity="0.22"></stop>
              <stop offset="1" style=${`stop-color:${accent}`} stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          ${grid} ${thr}
          <path d=${d + `L${X(n - 1)} ${baseY} L${X(0)} ${baseY} Z`} fill=${`url(#${gradId})`}></path>
          <line x1=${pad.l} y1=${ay} x2=${W - pad.r} y2=${ay} stroke=${accent} stroke-width="1" stroke-dasharray="4 4" opacity="0.4"></line>
          <path d=${d} fill="none" style=${`stroke:${accent}`} stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
          ${tip ? svg`<line x1=${tip.x} y1=${pad.t} x2=${tip.x} y2=${baseY} stroke="rgba(255,255,255,0.14)" stroke-width="1"></line>` : nothing}
          <circle cx=${ex} cy=${ey} r="8" fill=${accent} opacity="0.15"></circle>
          <circle cx=${ex} cy=${ey} r="3.5" fill=${accent} stroke="var(--card-background-color,#17181c)" stroke-width="2"></circle>
        </svg>
        ${tip ? html`<div class="tip" style="left:${(tip.x / W) * 100}%;top:12px"><b>${tip.label}</b> · ${tip.text}</div>` : nothing}
      </div>
    `;
  }

  private block(mi: number, m: DetailMetric): TemplateResult {
    const accent = resolveColor(m.color, mi % 2 === 0 ? "var(--ember-accent)" : "var(--ember-teal)");
    const dp = m.decimals ?? 1;
    const s = this.st(m.entity);
    const curNum = s && !isNaN(+s.state) ? +s.state : null;
    // colour the current value by thresholds (CO2 etc.)
    let curColor = "var(--primary-text-color)";
    if (curNum != null) {
      for (const t of m.thresholds ?? []) if (curNum >= t.value) curColor = resolveColor(t.color);
    }
    const pts = this.data[m.entity] ?? [];
    const vals = pts.map((p) => p.val);
    const has = vals.length > 0;
    const mn = has ? Math.min(...vals) : 0;
    const mx = has ? Math.max(...vals) : 0;
    const avg = has ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return html`
      <div class="block">
        <div class="lrow">
          <span class="lname"><span class="dot" style="background:${accent}"></span>${m.name}</span>
          <span class="cur"
            ><span class="v" style="color:${curColor}">${curNum == null ? "—" : curNum.toFixed(dp)}</span
            >${m.unit ? html`<span class="u">${m.unit}</span>` : nothing}</span
          >
        </div>
        ${this.chart(mi, m, accent)}
        ${has
          ? html`<div class="chips">
              <span class="stat"><span class="k">Min</span><span class="v">${mn.toFixed(dp)}</span></span>
              <span class="stat"><span class="k">Avg</span><span class="v">${avg.toFixed(dp)}</span></span>
              <span class="stat"><span class="k">Max</span><span class="v">${mx.toFixed(dp)}</span></span>
            </div>`
          : nothing}
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config || !this.open) return nothing;
    const c = this.config;
    const statusCol = this.statusColor();
    const statusState = c.status ? this.st(c.status.entity)?.state : undefined;
    const chipBg = statusCol ? `color-mix(in srgb, ${statusCol} 16%, transparent)` : "rgba(127,140,150,0.14)";
    return html`
      <div class="backdrop" @click=${() => this.close()}>
        <div class="panel" @click=${(e: Event) => e.stopPropagation()}>
          <div class="head">
            <div class="chip" style="background:${chipBg}">
              <ha-icon .icon=${c.icon || "mdi:chart-line"} style="color:${statusCol ?? "var(--ember-accent)"}"></ha-icon>
            </div>
            <div class="tt">
              <div class="title">${c.name ?? ""}</div>
              ${c.subtitle ? html`<div class="sub">${c.subtitle}</div>` : nothing}
            </div>
            ${statusState
              ? html`<span class="pill" style="color:${statusCol};background:${chipBg}">${statusState}</span>`
              : nothing}
            <button class="close" @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="caption"><span>Last 24 hours</span><span>${this.updatedLabel()}</span></div>
          ${c.metrics.map((m, i) => this.block(i, m))}
        </div>
      </div>
    `;
  }
}

if (!customElements.get("ember-sensor-detail")) {
  customElements.define("ember-sensor-detail", EmberSensorDetail);
  (window.customCards = window.customCards || []).push({
    type: "ember-sensor-detail",
    name: "Ember Sensor Detail",
    description: "Hash pop-up: last-24h graphs for one or more sensors",
    preview: false,
  });
}
