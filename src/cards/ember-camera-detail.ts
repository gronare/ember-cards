import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens } from "../shared/theme";

export interface CameraStat {
  entity: string;
  label: string;
  unit?: string;
}
export interface EmberCameraDetailConfig extends LovelaceCardConfig {
  hash: string;
  entity: string; // camera.*
  name?: string;
  subtitle?: string;
  icon?: string;
  refresh?: number; // ms between frame reloads; default 1500
  stats?: CameraStat[];
}

// Tap-to-open camera pop-up. Bambu A1 (and similar) cameras are still-image only
// (supported_features 0, no stream) — HA's native more-info tries an MJPEG live
// view that stalls on the ~1 fps LAN feed and shows a broken image. This renders
// the working camera_proxy still and reloads it on an interval, fitted to the
// viewport so it never overflows the screen.
export class EmberCameraDetail extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberCameraDetailConfig;
  @state() private open = false;
  @state() private tick = 0;

  private onHash = () => this.sync();
  private timer?: number;

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
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3vh 12px;
        overflow-y: auto;
      }
      .panel {
        width: 100%;
        max-width: min(96vw, 880px);
        background: var(--card-background-color, #17181c);
        border-radius: 24px;
        padding: 20px;
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
      .imgwrap {
        margin-top: 16px;
        border-radius: 16px;
        overflow: hidden;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        position: relative;
      }
      .feed {
        display: block;
        width: 100%;
        height: auto;
        max-height: 74vh;
        object-fit: contain;
      }
      .msg {
        position: absolute;
        font-family: var(--ember-mono);
        font-size: 12px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .stats {
        display: flex;
        gap: 8px;
        margin-top: 14px;
        flex-wrap: wrap;
      }
      .stat {
        display: inline-flex;
        gap: 6px;
        align-items: baseline;
        border: 1px solid var(--divider-color);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 999px;
        padding: 4px 11px;
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

  setConfig(config: EmberCameraDetailConfig): void {
    if (!config.hash) throw new Error("ember-camera-detail: 'hash' is required");
    if (!config.entity) throw new Error("ember-camera-detail: 'entity' is required");
    this.config = config;
  }
  getCardSize(): number {
    return 1;
  }
  static getStubConfig(): Omit<EmberCameraDetailConfig, "type"> {
    return { hash: "#camera", entity: "" };
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
    this.sync();
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onHash);
    this.stop();
  }

  private sync(): void {
    const open = this.config != null && window.location.hash === this.config.hash;
    if (open === this.open) return;
    this.open = open;
    if (open) this.start();
    else this.stop();
  }
  private start(): void {
    this.stop();
    const ms = Math.max(500, this.config?.refresh ?? 1500);
    this.timer = window.setInterval(() => (this.tick = this.tick + 1), ms);
  }
  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  private close(): void {
    if (window.location.hash === this.config?.hash) window.history.back();
    else this.sync();
  }

  private src(): string | null {
    const st = this.hass?.states[this.config!.entity];
    if (!st) return null;
    const pic = st.attributes.entity_picture as string | undefined;
    const base = pic ?? (st.attributes.access_token
      ? `/api/camera_proxy/${this.config!.entity}?token=${st.attributes.access_token}`
      : null);
    if (!base) return null;
    return base + (base.includes("?") ? "&" : "?") + "_=" + this.tick;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config || !this.open) return nothing;
    const c = this.config;
    const src = this.src();
    const stats = (c.stats ?? []).map((s) => {
      const st = this.hass?.states[s.entity];
      const v = st && !["unknown", "unavailable"].includes(st.state) ? st.state : "—";
      return { label: s.label, value: v, unit: s.unit ?? "" };
    });
    return html`
      <div class="backdrop" @click=${() => this.close()}>
        <div class="panel" @click=${(e: Event) => e.stopPropagation()}>
          <div class="head">
            <div class="chip">
              <ha-icon .icon=${c.icon || "mdi:printer-3d-nozzle"} style="color:var(--ember-accent)"></ha-icon>
            </div>
            <div class="tt">
              <div class="title">${c.name ?? ""}</div>
              ${c.subtitle ? html`<div class="sub">${c.subtitle}</div>` : nothing}
            </div>
            <button class="close" @click=${() => this.close()}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="imgwrap">
            <span class="msg">No image</span>
            ${src ? html`<img class="feed" src=${src} alt="camera" />` : nothing}
          </div>
          ${stats.length
            ? html`<div class="stats">
                ${stats.map(
                  (s) => html`<span class="stat"><span class="k">${s.label}</span><span class="v">${s.value}${s.unit ? " " + s.unit : ""}</span></span>`
                )}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }
}

if (!customElements.get("ember-camera-detail")) {
  customElements.define("ember-camera-detail", EmberCameraDetail);
  (window.customCards = window.customCards || []).push({
    type: "ember-camera-detail",
    name: "Ember Camera Detail",
    description: "Hash pop-up: refreshing still-image camera view, fitted to screen",
    preview: false,
  });
}
