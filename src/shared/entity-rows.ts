import { LitElement, html, css, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";

export interface EntityRow {
  entity: string;
  name?: string;
}

// Reusable "entity + label" list editor (the piece the whole library leans on).
// One ha-form per row (grid: entity picker + text) so it reuses HA's own
// selectors + lazy loading; add / remove / reorder around it.
export class EmberEntityRows extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) rows: EntityRow[] = [];
  @property({ attribute: false }) domains: string[] = ["light", "switch"];

  static styles = css`
    .row {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 6px;
    }
    .row ha-form {
      flex: 1;
      min-width: 0;
    }
    .moves {
      display: flex;
      flex-direction: column;
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
    button.icon:disabled {
      opacity: 0.3;
      cursor: default;
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
    ha-icon {
      --mdc-icon-size: 18px;
    }
  `;

  private schema() {
    return [
      {
        type: "grid",
        column_min_width: "120px",
        schema: [
          { name: "entity", selector: { entity: { domain: this.domains } } },
          { name: "name", selector: { text: {} } },
        ],
      },
    ];
  }

  private label = (s: { name: string }) =>
    s.name === "entity" ? "Light / switch" : "Pill name";

  private emit(rows: EntityRow[]): void {
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
    rows[i] = { ...rows[i], ...e.detail.value };
    this.emit(rows);
  }

  private removeRow(i: number): void {
    this.emit(this.rows.filter((_, j) => j !== i));
  }

  private add(): void {
    this.emit([...this.rows, { entity: "", name: "" }]);
  }

  private move(i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= this.rows.length) return;
    const rows = [...this.rows];
    [rows[i], rows[j]] = [rows[j], rows[i]];
    this.emit(rows);
  }

  render(): TemplateResult {
    return html`
      ${this.rows.map(
        (row, i) => html`
          <div class="row">
            <div class="moves">
              <button
                class="icon"
                ?disabled=${i === 0}
                @click=${() => this.move(i, -1)}
                title="Move up"
              >
                <ha-icon icon="mdi:chevron-up"></ha-icon>
              </button>
              <button
                class="icon"
                ?disabled=${i === this.rows.length - 1}
                @click=${() => this.move(i, 1)}
                title="Move down"
              >
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            </div>
            <ha-form
              .hass=${this.hass}
              .data=${row}
              .schema=${this.schema()}
              .computeLabel=${this.label}
              @value-changed=${(e: CustomEvent) => this.updateRow(i, e)}
            ></ha-form>
            <button class="icon" @click=${() => this.removeRow(i)} title="Remove">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
        `
      )}
      <button class="add" @click=${() => this.add()}>+ Add light</button>
    `;
  }
}

if (!customElements.get("ember-entity-rows")) {
  customElements.define("ember-entity-rows", EmberEntityRows);
}
