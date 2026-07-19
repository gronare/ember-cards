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
  stream_switch?: string; // switch that powers the camera stream (start on demand, stop on close)
  stats?: CameraStat[];
}

// Tap-to-open camera pop-up. Bambu A1 (and similar) cameras are still-image only
// (supported_features 0, no stream) — HA's native more-info tries an MJPEG live
// view that stalls on the ~1 fps LAN feed and shows a broken image. This renders
// the working camera_proxy still and reloads it on an interval, fitted to the
// viewport so it never overflows the screen.
//
// When `stream_switch` is set, streaming is on-demand: the camera is off until you
// press start (which powers the switch on), and closing the pop-up powers it back
// off — but only if this pop-up was the one that turned it on (so a print you left
// the camera on for isn't cut off).
export class EmberCameraDetail extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberCameraDetailConfig;
  @state() private open = false;
  @state() private streaming = false;
  @state() private tick = 0;

  private weOn = false; // this pop-up powered the stream switch on
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
      .stage {
        margin-top: 16px;
        border-radius: 16px;
        overflow: hidden;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 4 / 3;
        max-height: 74vh;
        position: relative;
      }
      .feed {
        display: block;
        width: 100%;
        height: 100%;
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
      .start {
        border: none;
        background: none;
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .start .ring {
        width: 72px;
        height: 72px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--ember-accent) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--ember-accent) 45%, transparent);
      }
      .start .ring ha-icon {
        --mdc-icon-size: 34px;
        color: var(--ember-accent);
      }
      .start .cap {
        font-family: var(--ember-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .live {
        position: absolute;
        top: 10px;
        left: 10px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--ember-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fff;
        background: rgba(0, 0, 0, 0.45);
        border-radius: 999px;
        padding: 3px 9px;
      }
      .live .d {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--ember-alert, #e5705c);
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
    this.teardown();
  }

  private sync(): void {
    const open = this.config != null && window.location.hash === this.config.hash;
    if (open === this.open) return;
    this.open = open;
    if (open) this.onOpen();
    else this.teardown();
  }

  private onOpen(): void {
    const sw = this.config?.stream_switch;
    if (!sw) {
      // no switch to manage — always-available camera, poll immediately
      this.streaming = true;
      this.startPoll();
      return;
    }
    // switch-gated camera: if it's already on, show it (but don't own it);
    // otherwise wait for an explicit start press.
    if (this.hass?.states[sw]?.state === "on") {
      this.weOn = false;
      this.streaming = true;
      this.startPoll();
    } else {
      this.streaming = false;
    }
  }

  private startStream(): void {
    const sw = this.config?.stream_switch;
    if (sw && this.hass?.states[sw]?.state !== "on") {
      this.hass?.callService("switch", "turn_on", { entity_id: sw });
      this.weOn = true;
    }
    this.streaming = true;
    this.startPoll();
  }

  // stop polling; power the switch back off only if we turned it on
  private teardown(): void {
    this.stopPoll();
    const sw = this.config?.stream_switch;
    if (sw && this.weOn) {
      this.hass?.callService("switch", "turn_off", { entity_id: sw });
      this.weOn = false;
    }
    this.streaming = false;
  }

  private startPoll(): void {
    this.stopPoll();
    const ms = Math.max(500, this.config?.refresh ?? 1500);
    this.timer = window.setInterval(() => (this.tick = this.tick + 1), ms);
  }
  private stopPoll(): void {
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

  private renderStage(): TemplateResult {
    if (!this.streaming) {
      return html`<button class="start" @click=${() => this.startStream()}>
        <span class="ring"><ha-icon icon="mdi:play"></ha-icon></span>
        <span class="cap">Start camera</span>
      </button>`;
    }
    const src = this.src();
    if (!src) return html`<span class="msg">Starting…</span>`;
    return html`
      <span class="live"><span class="d"></span>Live</span>
      <img class="feed" src=${src} alt="camera" />
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config || !this.open) return nothing;
    const c = this.config;
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
          <div class="stage">${this.renderStage()}</div>
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
    description: "Hash pop-up: on-demand still-image camera view, fitted to screen",
    preview: false,
  });
}
