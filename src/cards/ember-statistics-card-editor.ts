import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberStatisticsCardConfig } from "./ember-statistics-card";

const LABELS: Record<string, string> = {
  entity: "Statistic",
  name: "Name",
  icon: "Icon",
  unit: "Unit (override)",
  graph: "Graph type",
  aggregation: "Aggregation",
  period: "Period",
  days: "Days back",
  color: "Colour",
  stats: "Footer stats",
  align: "Week/month framing",
  periods: "Period chips",
  show_period_selector: "Show period selector",
};

const sel = (options: Array<{ value: string; label: string }>, multiple = false) => ({
  select: { mode: "dropdown", options, multiple },
});

// Editor mirrors the ember-climate-card-editor pattern: one ha-form, spread the
// existing config on every change, emit config-changed. The main field uses HA's
// statistic selector so external statistics (e.g. curves:electricity_daily,
// which are NOT entities) are selectable, not just entity-backed sensors.
export class EmberStatisticsCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberStatisticsCardConfig;

  static styles = css`
    ha-form {
      display: block;
    }
  `;

  setConfig(config: EmberStatisticsCardConfig): void {
    this.config = config;
  }

  private label = (s: { name: string }): string => LABELS[s.name] ?? s.name;

  private get schema() {
    return [
      { name: "entity", selector: { statistic: {} } },
      {
        type: "grid",
        schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ],
      },
      {
        type: "grid",
        schema: [
          {
            name: "graph",
            selector: sel([
              { value: "auto", label: "Auto" },
              { value: "bar", label: "Bar" },
              { value: "line", label: "Line" },
              { value: "area", label: "Area" },
            ]),
          },
          {
            name: "aggregation",
            selector: sel([
              { value: "change", label: "Change (sum)" },
              { value: "mean", label: "Mean" },
              { value: "min", label: "Min" },
              { value: "max", label: "Max" },
            ]),
          },
        ],
      },
      {
        type: "grid",
        schema: [
          {
            name: "period",
            selector: sel([
              { value: "hour", label: "Hour" },
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]),
          },
          {
            name: "days",
            selector: { number: { min: 1, max: 400, step: 1, mode: "box" } },
          },
        ],
      },
      {
        type: "grid",
        schema: [
          { name: "unit", selector: { text: {} } },
          {
            name: "color",
            selector: sel([
              { value: "amber", label: "Amber" },
              { value: "teal", label: "Teal" },
              { value: "green", label: "Green" },
            ]),
          },
        ],
      },
      {
        name: "stats",
        selector: sel(
          [
            { value: "total", label: "Total" },
            { value: "avg", label: "Avg" },
            { value: "min", label: "Min" },
            { value: "max", label: "Max" },
            { value: "peak", label: "Peak" },
          ],
          true
        ),
      },
      {
        type: "grid",
        schema: [
          {
            name: "align",
            selector: sel([
              { value: "calendar", label: "Calendar (Mon / 1st)" },
              { value: "rolling", label: "Rolling (last N days)" },
            ]),
          },
          {
            name: "periods",
            selector: sel(
              [
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
                { value: "year", label: "Year" },
              ],
              true
            ),
          },
        ],
      },
      { name: "show_period_selector", selector: { boolean: {} } },
    ];
  }

  private onChange(e: CustomEvent): void {
    e.stopPropagation();
    const config = { ...this.config, ...e.detail.value } as EmberStatisticsCardConfig;
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.schema}
        .computeLabel=${this.label}
        @value-changed=${this.onChange}
      ></ha-form>
    `;
  }
}

if (!customElements.get("ember-statistics-card-editor")) {
  customElements.define("ember-statistics-card-editor", EmberStatisticsCardEditor);
}
