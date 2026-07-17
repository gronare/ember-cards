import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { EmberMetricConfig } from "./ember-metric";

const LABELS: Record<string, string> = {
  entity: "Statistic",
  name: "Name",
  icon: "Icon",
  unit: "Unit (override)",
  period: "Default period",
  periods: "Available periods",
  aggregation: "Aggregation",
  compare: "Compare against",
  color: "Colour",
  show_sparkline: "Show sparkline",
  subtitle: "Subtitle",
};

const sel = (options: Array<{ value: string; label: string }>, multiple = false) => ({
  select: { mode: "dropdown", options, multiple },
});

export class EmberMetricEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberMetricConfig;

  setConfig(config: EmberMetricConfig): void {
    this.config = config;
  }

  private label = (s: { name: string }) => LABELS[s.name] ?? s.name;

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
        name: "periods",
        selector: sel(
          [
            { value: "today", label: "Today" },
            { value: "yesterday", label: "Yesterday" },
            { value: "week", label: "This week" },
            { value: "month", label: "This month" },
          ],
          true
        ),
      },
      {
        type: "grid",
        schema: [
          {
            name: "compare",
            selector: sel([
              { value: "norm", label: "Norm (typical weekday)" },
              { value: "previous", label: "Previous period" },
              { value: "none", label: "No comparison" },
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
      { name: "subtitle", selector: { text: {} } },
      { name: "show_sparkline", selector: { boolean: {} } },
    ];
  }

  private onChange(e: CustomEvent): void {
    e.stopPropagation();
    const config = { ...this.config, ...e.detail.value } as EmberMetricConfig;
    this.config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    return html`<ha-form
      .hass=${this.hass}
      .data=${this.config}
      .schema=${this.schema}
      .computeLabel=${this.label}
      @value-changed=${this.onChange}
    ></ha-form>`;
  }
}

if (!customElements.get("ember-metric-editor")) {
  customElements.define("ember-metric-editor", EmberMetricEditor);
}
