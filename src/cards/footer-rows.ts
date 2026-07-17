import { LitElement, html, css, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { FooterSegment } from "./ember-room-card";

const KINDS = [
  { value: "temphum", label: "Temp + Humidity" },
  { value: "airquality", label: "Air quality" },
  { value: "cover", label: "Cover (open / closed)" },
  { value: "onoff", label: "On / Off" },
  { value: "motion", label: "Motion" },
  { value: "lock", label: "Lock" },
  { value: "state", label: "Raw state" },
];

const LABELS: Record<string, string> = {
  kind: "Kind",
  entity: "Entity",
  humidity: "Humidity entity",
  label: "Label",
  open: "Open text",
  closed: "Closed text",
};

// Footer = up to two typed segments. Each row is one ha-form whose schema
// depends on the chosen kind, so kind-specific fields appear/disappear live.
export class EmberFooterRows extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) rows: FooterSegment[] = [];

  static styles = css`
    .row {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--divider-color);
    }
    .row ha-form {
      flex: 1;
      min-width: 0;
    }
    button.icon {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      padding: 2px;
      display: inline-flex;
    }
    button.icon:hover {
      color: var(--primary-text-color);
    }
    button.add {
      margin-top: 4px;
      background: none;
      border: 1px dashed var(--divider-color);
      border-radius: 8px;
      color: var(--primary-text-color);
      cursor: pointer;
      padding: 8px 12px;
      width: 100%;
      font: inherit;
    }
    button.add:hover {
      border-color: var(--primary-color);
    }
    button.add:disabled {
      opacity: 0.4;
      cursor: default;
    }
    ha-icon {
      --mdc-icon-size: 18px;
    }
  `;

  private schema(seg: FooterSegment) {
    const kind = {
      name: "kind",
      selector: { select: { mode: "dropdown", options: KINDS } },
    };
    switch (seg.kind) {
      case "temphum":
        return [
          kind,
          {
            type: "grid",
            schema: [
              { name: "entity", selector: { entity: { domain: "sensor" } } },
              { name: "humidity", selector: { entity: { domain: "sensor" } } },
            ],
          },
        ];
      case "cover":
        return [
          kind,
          {
            type: "grid",
            schema: [
              { name: "entity", selector: { entity: { domain: "cover" } } },
              { name: "label", selector: { text: {} } },
            ],
          },
          {
            type: "grid",
            schema: [
              { name: "open", selector: { text: {} } },
              { name: "closed", selector: { text: {} } },
            ],
          },
        ];
      default:
        return [
          kind,
          {
            type: "grid",
            schema: [
              { name: "entity", selector: { entity: {} } },
              { name: "label", selector: { text: {} } },
            ],
          },
        ];
    }
  }

  private label = (s: { name: string }) => LABELS[s.name] ?? s.name;

  private emit(rows: FooterSegment[]): void {
    this.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: rows },
        bubbles: true,
        composed: true,
      })
    );
  }

  private updateRow(i: number, e: CustomEvent): void {
    e.stopPropagation();
    const rows = [...this.rows];
    rows[i] = { ...rows[i], ...e.detail.value } as FooterSegment;
    this.emit(rows);
  }

  private removeRow(i: number): void {
    this.emit(this.rows.filter((_, j) => j !== i));
  }

  private add(): void {
    this.emit([
      ...this.rows,
      { kind: "state", entity: "", label: "" } as FooterSegment,
    ]);
  }

  render(): TemplateResult {
    return html`
      ${this.rows.map(
        (row, i) => html`
          <div class="row">
            <ha-form
              .hass=${this.hass}
              .data=${row}
              .schema=${this.schema(row)}
              .computeLabel=${this.label}
              @value-changed=${(e: CustomEvent) => this.updateRow(i, e)}
            ></ha-form>
            <button class="icon" @click=${() => this.removeRow(i)} title="Remove">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
        `
      )}
      <button class="add" ?disabled=${this.rows.length >= 2} @click=${() => this.add()}>
        + Add footer item
      </button>
    `;
  }
}

if (!customElements.get("ember-footer-rows")) {
  customElements.define("ember-footer-rows", EmberFooterRows);
}
