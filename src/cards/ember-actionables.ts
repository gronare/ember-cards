import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";
import { emberTokens, emberCard } from "../shared/theme";

type Tier = "alert" | "active" | "ambient";
interface Item {
  tier: Tier;
  icon: string;
  label: string;
  value: string;
  tint: string; // resolved css colour for chip/bar/icon/badge
  ambient?: boolean; // neutral chip bg, tint = icon-only cue
  bar?: number; // progress %
  badge?: { text?: string; icon?: string; pill?: boolean; onClick?: () => void };
  onTap?: () => void;
}

export interface EmberActionablesConfig extends LovelaceCardConfig {
  max_items?: number; // default 2
  paused_grace?: number; // minutes a paused media stays with a resume button; default 45
  battery_threshold?: number; // default 15
  media?: {
    // each group = media_players that share ONE screen (e.g. Apple TV + the LG
    // TV + the Sonos playing TV audio). When >1 in a group is active, only the
    // "best" (real content / app title over a generic source like "TV") shows.
    groups?: string[][];
  };
  washer?: {
    status?: string;
    remaining?: string;
    total?: string;
    operation?: string;
    name?: string;
    unload?: string;
    cycles?: string; // cycle counter that resets on the drum-clean program
    clean_after?: number; // cycles-since-clean that triggers the reminder; default 30
  };
  air?: { co2?: string; pm25?: string; category?: string };
  health?: { zigbee?: string; coordinator_eth?: string; coordinator_net?: string; bt_proxy?: string; navigate?: string };
  lock?: { entity?: string; persons?: string[] };
  printer?: {
    status?: string;
    progress?: string;
    remaining?: string;
    end?: string;
    layer?: string;
    total_layers?: string;
    task?: string;
    error?: string;
    camera?: string;
    camera_hash?: string;
    collected?: string; // input_boolean toggled by the Done badge to dismiss the finished row
    name?: string;
  };
}

const WASH_ON = ["run", "running", "wash", "washing", "rinse", "rinsing", "spin", "spinning", "drying", "steam"];
const D = {
  wStatus: "sensor.wall_e_current_status",
  wRem: "sensor.wall_e_remaining_time",
  wTot: "sensor.wall_e_total_time",
  wOp: "select.wall_e_operation",
  wName: "Wall-E",
  wUnload: "input_boolean.washer_needs_unload",
  co2: "sensor.alpstuga_air_quality_monitor_carbon_dioxide",
  airCat: "sensor.alpstuga_air_quality_monitor_air_quality",
  zigbee: "binary_sensor.zigbee2mqtt_bridge_connection_state",
  cEth: "binary_sensor.slzb_mr5u_ethernet",
  cNet: "binary_sensor.slzb_mr5u_internet",
  btProxy: "sensor.bluetooth_proxy_slzb_06_uptime",
  healthNav: "#wardrobe",
  lock: "lock.front_door_lock",
  persons: ["person.carl_green", "person.di"],
  pStatus: "sensor.wardrobe_a1_mini_print_status",
  pProg: "sensor.wardrobe_a1_mini_print_progress",
  pRem: "sensor.wardrobe_a1_mini_remaining_time",
  pEnd: "sensor.wardrobe_a1_mini_end_time",
  pLayer: "sensor.wardrobe_a1_mini_current_layer",
  pTotal: "sensor.wardrobe_a1_mini_total_layer_count",
  pTask: "sensor.wardrobe_a1_mini_task_name",
  pErr: "binary_sensor.wardrobe_a1_mini_print_error",
  pCam: "camera.wardrobe_a1_mini_camera",
  pCamHash: "#a1-camera",
  pCollected: "input_boolean.a1_print_collected",
  pName: "A1 Mini",
};
const num = (v: string | undefined): number | null =>
  v == null || v === "" || isNaN(+v) ? null : +v;
const parseDur = (s?: string): number | null => {
  if (!s) return null;
  const p = s.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : null;
};

// "What needs me now" — a strict Alert > Active > Ambient tier ladder over the
// home's signals; 2 rows always, hairline overflow footer, alert left-bar
// grammar. Content model designed by fable (see vault).
export class EmberActionables extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: EmberActionablesConfig;
  @state() private tick = 0;
  private timer?: number;
  private since = new Map<string, number>(); // debounce/hysteresis timestamps

  static styles = [
    emberTokens,
    emberCard,
    css`
      ha-card {
        display: flex;
        flex-direction: column;
      }
      .item {
        display: flex;
        gap: 16px;
        align-items: center;
        position: relative;
      }
      .item + .item {
        border-top: 1px solid var(--divider-color);
        margin-top: 13px;
        padding-top: 13px;
      }
      .item.alert {
        padding-left: 12px;
      }
      .item.alert::before {
        content: "";
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 3px;
        border-radius: 999px;
        background: var(--rt);
      }
      .chip {
        width: 54px;
        height: 54px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        flex: none;
      }
      .chip ha-icon {
        --mdc-icon-size: 28px;
      }
      .info {
        flex: 1;
        min-width: 0;
        text-align: left;
      }
      .lbl {
        font-size: 11.5px;
        color: var(--secondary-text-color);
        font-family: var(--ember-mono);
        text-transform: uppercase;
        letter-spacing: 0.09em;
      }
      .val {
        font-size: 18px;
        font-weight: 650;
        color: var(--primary-text-color);
        margin-top: 2px;
        overflow: hidden;
        white-space: nowrap;
      }
      .val .rolltext {
        display: inline-block;
      }
      .val.marquee .rolltext {
        animation: ember-roll var(--rolldur, 12s) linear infinite;
      }
      @keyframes ember-roll {
        0%,
        8% {
          transform: translateX(0);
        }
        92%,
        100% {
          transform: translateX(var(--roll, 0));
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .val.marquee .rolltext {
          animation: none;
        }
        .val {
          text-overflow: ellipsis;
        }
      }
      .bar {
        height: 4px;
        border-radius: 999px;
        background: var(--divider-color);
        margin-top: 10px;
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--rt);
      }
      .badge {
        font-family: var(--ember-mono);
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 7px;
        letter-spacing: 0.02em;
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .badge ha-icon {
        --mdc-icon-size: 20px;
        display: block;
      }
      .badge.pill {
        border: 1px solid;
        padding: 4px 12px;
        text-transform: uppercase;
        font-weight: 600;
      }
      .badge.click {
        cursor: pointer;
      }
      .badge.click:hover {
        filter: brightness(1.15);
      }
      .item.tap {
        cursor: pointer;
      }
      /* overflow footer */
      .more {
        display: flex;
        align-items: center;
        gap: 8px;
        border-top: 1px solid var(--divider-color);
        margin-top: 12px;
        padding-top: 9px;
        font-family: var(--ember-mono);
        font-size: 10.5px;
        letter-spacing: 0.04em;
        color: var(--secondary-text-color);
        flex-wrap: wrap;
      }
      .more .m {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        text-transform: uppercase;
      }
      .more .d {
        width: 5px;
        height: 5px;
        border-radius: 50%;
      }
      /* calm */
      .calm {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .calm .chip ha-icon {
        color: color-mix(in srgb, var(--ember-good) 75%, transparent);
      }
      .calm .badge {
        margin-left: auto;
        color: var(--secondary-text-color);
      }
    `,
  ];

  setConfig(config: EmberActionablesConfig): void {
    this.config = config;
  }
  getCardSize(): number {
    return 2;
  }
  static getStubConfig(): Omit<EmberActionablesConfig, "type"> {
    return {};
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.tick = this.tick + 1), 20000);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) clearInterval(this.timer);
  }

  // marquee any value line that overflows its row (long titles on narrow phones)
  updated(): void {
    this.renderRoot.querySelectorAll<HTMLElement>(".val").forEach((el) => {
      const inner = el.querySelector<HTMLElement>(".rolltext");
      if (!inner) return;
      const overflow = inner.scrollWidth - el.clientWidth;
      if (overflow > 4) {
        el.style.setProperty("--roll", `-${overflow + 12}px`);
        el.style.setProperty("--rolldur", `${Math.max(7, (overflow + 12) / 28)}s`);
        el.classList.add("marquee");
      } else {
        el.classList.remove("marquee");
        el.style.removeProperty("--roll");
      }
    });
  }

  // hysteresis + sustain: arm on `on`, release on `off`, hold in between;
  // returns true once armed for >= ms.
  private hold(key: string, on: boolean, off: boolean, ms: number): boolean {
    if (on) {
      if (!this.since.has(key)) this.since.set(key, Date.now());
    } else if (off) {
      this.since.delete(key);
      return false;
    }
    const t = this.since.get(key);
    return t != null && Date.now() - t >= ms;
  }

  private call(domain: string, service: string, entity: string): void {
    this.hass?.callService(domain, service, { entity_id: entity });
  }
  private moreInfo(entityId: string): void {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }
  private navigate(path: string): void {
    if (path.startsWith("#")) window.location.hash = path;
    else {
      history.pushState(null, "", path);
      window.dispatchEvent(new Event("location-changed"));
    }
  }

  private items(): Item[] {
    const hass = this.hass;
    if (!hass || !this.config) return [];
    const cfg = this.config;
    const s = (e: string) => hass.states[e];
    const out: Item[] = [];

    // ── ALERT 1 · unlocked away (dormant while the lock is unavailable) ──
    const lockE = cfg.lock?.entity ?? D.lock;
    const lock = s(lockE);
    if (lock && !["unavailable", "unknown"].includes(lock.state)) {
      const persons = cfg.lock?.persons ?? D.persons;
      const away = persons.every((p) => s(p)?.state !== "home");
      const cond = lock.state === "unlocked" && away;
      if (this.hold("lock", cond, !cond, 120000)) {
        out.push({
          tier: "alert",
          icon: "mdi:lock-open-variant",
          label: "Front door",
          value: "Unlocked — nobody home",
          tint: "var(--ember-alert)",
          badge: { text: "Lock", pill: true, onClick: () => this.call("lock", "lock", lockE) },
          onTap: () => this.call("lock", "lock", lockE),
        });
      }
    }

    // ── ALERT 2 · system degraded ──
    const zb = s(cfg.health?.zigbee ?? D.zigbee);
    const eth = s(cfg.health?.coordinator_eth ?? D.cEth);
    const net = s(cfg.health?.coordinator_net ?? D.cNet);
    const bt = s(cfg.health?.bt_proxy ?? D.btProxy);
    const down: { t: string; sev: "alert" | "warn" }[] = [];
    if (zb && zb.state === "off") down.push({ t: "Zigbee mesh offline", sev: "alert" });
    if (eth && eth.state === "off") down.push({ t: "Coordinator offline", sev: "alert" });
    else if (net && net.state === "off") down.push({ t: "Coordinator: no internet", sev: "warn" });
    if (bt && ["unavailable", "unknown"].includes(bt.state)) down.push({ t: "BT proxy offline", sev: "warn" });
    if (this.hold("sys", down.length > 0, down.length === 0, 300000) && down.length) {
      const alert = down.some((d) => d.sev === "alert");
      const worst = down.find((d) => d.sev === "alert") ?? down[0];
      out.push({
        tier: "alert",
        icon: "mdi:lan-disconnect",
        label: "System",
        value: worst.t + (down.length > 1 ? ` +${down.length - 1}` : ""),
        tint: alert ? "var(--ember-alert)" : "var(--ember-warn)",
        badge: { text: "Down" },
        onTap: () => this.navigate(cfg.health?.navigate ?? D.healthNav),
      });
    }

    // ── ALERT 3 · ventilate (hysteresis 1200 up / 1000 down; sustain 5 min) ──
    const co2E = cfg.air?.co2 ?? D.co2;
    const co2 = num(s(co2E)?.state);
    const poor = s(cfg.air?.category ?? D.airCat)?.state === "poor";
    const ventOn = (co2 != null && co2 >= 1200) || poor;
    const ventOff = (co2 == null || co2 < 1000) && !poor;
    if (this.hold("vent", ventOn, ventOff, 300000)) {
      out.push({
        tier: "alert",
        icon: "mdi:weather-windy",
        label: "Air",
        value: co2 != null && co2 >= 1200 ? `CO₂ ${Math.round(co2)} ppm — ventilate` : "Air poor — ventilate",
        tint: "var(--ember-warn)",
        bar: co2 != null ? Math.max(0, Math.min(100, ((co2 - 800) / 800) * 100)) : undefined,
        badge: { text: poor ? "Poor" : "High" },
        onTap: () => this.moreInfo(co2E),
      });
    }

    // ── ALERT · 3D print error ──
    const pStatE = cfg.printer?.status ?? D.pStatus;
    const pStat = String(s(pStatE)?.state ?? "").toLowerCase();
    const pName = cfg.printer?.name ?? D.pName;
    const pCam = cfg.printer?.camera ?? D.pCam;
    const pHash = cfg.printer?.camera_hash ?? D.pCamHash;
    const pColl = cfg.printer?.collected ?? D.pCollected;
    const openCam = () => (pHash ? this.navigate(pHash) : this.moreInfo(pCam));
    if (s(cfg.printer?.error ?? D.pErr)?.state === "on" || pStat === "failed") {
      out.push({
        tier: "alert",
        icon: "mdi:printer-3d-nozzle-alert",
        label: pName,
        value: "Print error — check printer",
        tint: "var(--ember-alert)",
        badge: { text: "Error" },
        onTap: openCam,
      });
    }

    // ── ACTIVE · timers (soonest first) ──
    Object.keys(hass.states)
      .filter((e) => e.startsWith("timer.") && s(e).state === "active")
      .map((e) => ({ e, st: s(e) }))
      .sort((a, b) => (Date.parse(a.st.attributes.finishes_at || "") || 0) - (Date.parse(b.st.attributes.finishes_at || "") || 0))
      .forEach(({ e, st }) => {
        const fin = st.attributes.finishes_at
          ? Math.max(0, Math.round((Date.parse(st.attributes.finishes_at) - Date.now()) / 60000))
          : null;
        const dur = parseDur(st.attributes.duration);
        const rem = st.attributes.finishes_at ? Math.max(0, (Date.parse(st.attributes.finishes_at) - Date.now()) / 1000) : null;
        out.push({
          tier: "active",
          icon: "mdi:timer-outline",
          label: st.attributes.friendly_name || "Timer",
          value: fin != null ? `${fin} min left` : "Running",
          tint: "var(--ember-accent)",
          bar: dur && rem != null ? Math.max(0, Math.min(100, (1 - rem / dur) * 100)) : undefined,
          onTap: () => this.moreInfo(e),
        });
      });

    // ── ACTIVE · washer done → unload ──
    const unloadE = cfg.washer?.unload ?? D.wUnload;
    if (s(unloadE)?.state === "on") {
      out.push({
        tier: "active",
        icon: "mdi:washing-machine",
        label: "Washer",
        value: "Done — unload",
        tint: "var(--ember-good)",
        badge: { text: "Done" },
        onTap: () => this.call("input_boolean", "turn_off", unloadE),
      });
    }

    // ── ACTIVE · washer running ──
    const ws = s(cfg.washer?.status ?? D.wStatus);
    if (ws && WASH_ON.includes(String(ws.state).toLowerCase())) {
      const rt = s(cfg.washer?.remaining ?? D.wRem);
      const tt = s(cfg.washer?.total ?? D.wTot);
      let rem: number | null = null;
      if (rt && rt.state && !["unknown", "unavailable"].includes(rt.state))
        rem = Math.max(0, Math.round((new Date(rt.state).getTime() - Date.now()) / 60000));
      let pct: number | null = null;
      if (rem != null && tt && !isNaN(+tt.state) && +tt.state > 0)
        pct = Math.min(98, Math.max(3, Math.round(100 * (1 - rem / +tt.state))));
      const op = s(cfg.washer?.operation ?? D.wOp);
      const prog = op && !["unknown", "unavailable"].includes(op.state) ? op.state : "";
      out.push({
        tier: "active",
        icon: "mdi:washing-machine",
        label: (cfg.washer?.name ?? D.wName) + (prog ? " · " + prog : ""),
        value: `Washing — ${rem != null ? rem + " min" : "…"} remaining`,
        tint: "var(--ember-teal)",
        bar: pct == null ? 60 : pct,
        badge: { text: "Running" },
      });
    }

    // ── ACTIVE · 3D printer (printing / paused → done → collect) ──
    if (["running", "prepare", "slicing", "pause"].includes(pStat)) {
      const paused = pStat === "pause";
      const prog = num(s(cfg.printer?.progress ?? D.pProg)?.state);
      const endS = s(cfg.printer?.end ?? D.pEnd)?.state;
      let remMin: number | null = null;
      if (endS && !["unknown", "unavailable"].includes(endS))
        remMin = Math.max(0, (Date.parse(endS) - Date.now()) / 60000);
      else {
        const rh = num(s(cfg.printer?.remaining ?? D.pRem)?.state);
        if (rh != null) remMin = rh * 60;
      }
      const cur = num(s(cfg.printer?.layer ?? D.pLayer)?.state);
      const tot = num(s(cfg.printer?.total_layers ?? D.pTotal)?.state);
      const task = s(cfg.printer?.task ?? D.pTask)?.state;
      const job = task && !["unknown", "unavailable"].includes(task) ? task : "";
      const left =
        remMin == null ? "…" : remMin >= 60 ? `${Math.floor(remMin / 60)}h ${Math.round(remMin % 60)}m` : `${Math.round(remMin)} min`;
      const layers = cur != null && tot != null && tot > 0 ? ` · layer ${Math.round(cur)}/${Math.round(tot)}` : "";
      out.push({
        tier: "active",
        icon: "mdi:printer-3d-nozzle",
        label: pName + (paused ? " · Paused" : job ? " · " + job : ""),
        value: `${paused ? "Paused" : "Printing"} — ${left} left${layers}`,
        tint: paused ? "var(--ember-warn)" : "var(--ember-accent)",
        bar: prog ?? undefined,
        badge: prog != null ? { text: `${Math.round(prog)}%` } : undefined,
        onTap: openCam,
      });
    } else if (pStat === "finish" && s(pColl)?.state !== "on") {
      out.push({
        tier: "active",
        icon: "mdi:printer-3d",
        label: pName,
        value: "Done — collect print",
        tint: "var(--ember-good)",
        badge: { text: "Done", onClick: () => this.call("input_boolean", "turn_on", pColl) },
        onTap: openCam,
      });
    }

    // ── ACTIVE · media (playing → recently-paused within grace) ──
    const graceMs = (cfg.paused_grace ?? 45) * 60000;
    const GENERIC = new Set(["TV", "Live TV", "HDMI", "Playing"]);
    const active = Object.keys(hass.states)
      .filter((e) => e.startsWith("media_player."))
      .map((e) => ({ e, st: s(e) }))
      .filter(({ st }) => st.state === "playing" || (st.state === "paused" && Date.now() - Date.parse(st.last_changed) < graceMs));
    // collapse each screen-group to its best-content member (Apple TV > "TV")
    const rich = (x: { st: { attributes: Record<string, string> } }): boolean => {
      const a = x.st.attributes;
      return !!a.app_name || (!!a.media_title && a.media_title !== a.source && !GENERIC.has(a.media_title));
    };
    const drop = new Set<string>();
    for (const grp of this.config?.media?.groups ?? []) {
      const members = active.filter((x) => grp.includes(x.e)).sort((a, b) => grp.indexOf(a.e) - grp.indexOf(b.e));
      if (members.length <= 1) continue;
      const pick = members.find(rich) ?? members[0];
      members.forEach((x) => x.e !== pick.e && drop.add(x.e));
    }
    active
      .filter((x) => !drop.has(x.e))
      .sort((a, b) => a.e.localeCompare(b.e)) // stable order — never reshuffle on play/pause
      .slice(0, 2)
      .forEach(({ e, st }) => {
        const playing = st.state === "playing";
        const t = st.attributes.media_title || (playing ? "Playing" : "Paused");
        const art = st.attributes.media_artist || st.attributes.app_name || "";
        const nm = st.attributes.friendly_name || e.split(".")[1];
        out.push({
          tier: "active",
          icon: "mdi:music-note",
          label: (playing ? "Now playing · " : "Paused · ") + nm,
          value: t + (art ? " — " + art : ""),
          tint: "var(--ember-teal)",
          // explicit pause/play by state — more reliable than the toggle on some
          // Apple TV apps (SVT Play etc.)
          badge: { icon: playing ? "mdi:pause" : "mdi:play", onClick: () => this.call("media_player", playing ? "media_pause" : "media_play", e) },
        });
      });

    // ── AMBIENT · clean the drum (cycles counter resets on the clean program) ──
    const cycE = cfg.washer?.cycles ?? "sensor.wall_e_cycles";
    const cyc = num(s(cycE)?.state);
    const cleanAfter = cfg.washer?.clean_after ?? 30;
    if (cyc != null && cyc >= cleanAfter) {
      out.push({
        tier: "ambient",
        ambient: true,
        icon: "mdi:washing-machine",
        label: "Washer",
        value: `Clean the drum — ${Math.round(cyc)} washes`,
        tint: "var(--ember-warn)",
        onTap: () => this.moreInfo(cycE),
      });
    }

    // ── AMBIENT · low battery (≤ threshold, sustained 60 min, release > 20 %) ──
    const bthr = cfg.battery_threshold ?? 15;
    const low = Object.keys(hass.states)
      .filter((e) => e.startsWith("sensor.") && e.endsWith("_battery"))
      .map((e) => ({ e, v: num(s(e).state) }))
      .filter((x): x is { e: string; v: number } => x.v != null)
      .filter((x) => this.hold("bat:" + x.e, x.v <= bthr, x.v > 20, 3600000))
      .sort((a, b) => a.v - b.v);
    if (low.length) {
      const worst = low[0];
      const nm = (s(worst.e).attributes.friendly_name || worst.e).replace(/ battery$/i, "");
      out.push({
        tier: "ambient",
        ambient: true,
        icon: "mdi:battery-alert-variant-outline",
        label: "Batteries",
        value: low.length === 1 ? `${nm} — ${Math.round(worst.v)}%` : `${low.length} devices low — worst ${Math.round(worst.v)}%`,
        tint: "var(--ember-warn)",
        badge: low.length > 1 ? { text: String(low.length) } : undefined,
        onTap: () => this.moreInfo(worst.e),
      });
    }

    // ── AMBIENT · updates ──
    const up = Object.keys(hass.states).filter((e) => e.startsWith("update.") && s(e).state === "on").length;
    if (up > 0) {
      out.push({
        tier: "ambient",
        ambient: true,
        icon: "mdi:package-up",
        label: "Maintenance",
        value: `${up} update${up > 1 ? "s" : ""} available`,
        tint: "var(--secondary-text-color)",
        badge: up > 1 ? { text: String(up) } : undefined,
        onTap: () => this.navigate("/config/updates"),
      });
    }

    return out;
  }

  private chipStyle(it: Item): string {
    if (it.ambient) return `background:#1f2126`;
    return `background:color-mix(in srgb, ${it.tint} 14%, transparent)`;
  }

  private renderRow(it: Item): TemplateResult {
    const b = it.badge;
    return html`
      <div
        class="item ${it.tier} ${it.onTap ? "tap" : ""}"
        style="--rt:${it.tint}"
        @click=${it.onTap ?? nothing}
      >
        <span class="chip" style=${this.chipStyle(it)}>
          <ha-icon icon=${it.icon} style="color:${it.ambient ? it.tint : it.tint}"></ha-icon>
        </span>
        <span class="info">
          <div class="lbl">${it.label}</div>
          <div class="val"><span class="rolltext">${it.value}</span></div>
          ${it.bar != null ? html`<div class="bar"><i style="width:${it.bar}%"></i></div>` : nothing}
        </span>
        ${b
          ? html`<span
              class="badge ${b.pill ? "pill" : ""} ${b.onClick ? "click" : ""}"
              style=${b.pill
                ? `color:${it.tint};background:color-mix(in srgb, ${it.tint} 14%, transparent);border-color:color-mix(in srgb, ${it.tint} 38%, transparent)`
                : `color:${it.tint};background:color-mix(in srgb, ${it.tint} 14%, transparent)`}
              @click=${b.onClick
                ? (e: Event) => {
                    e.stopPropagation();
                    b.onClick!();
                  }
                : nothing}
              >${b.icon ? html`<ha-icon icon=${b.icon}></ha-icon>` : b.text}</span
            >`
          : nothing}
      </div>
    `;
  }

  private renderCalm(): TemplateResult {
    const co2 = num(this.hass?.states[this.config?.air?.co2 ?? D.co2]?.state);
    return html`
      <div class="calm">
        <span class="chip" style="background:#1f2126"><ha-icon icon="mdi:check"></ha-icon></span>
        <span class="info">
          <div class="lbl">All clear</div>
          <div class="val">Nothing needs you</div>
        </span>
        ${co2 != null ? html`<span class="badge">AIR ${Math.round(co2)} PPM</span>` : nothing}
      </div>
    `;
  }

  render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    const items = this.items();
    if (!items.length) return html`<ha-card>${this.renderCalm()}</ha-card>`;
    const max = this.config.max_items ?? 2;
    const shown = items.slice(0, max);
    const rest = items.slice(max);
    return html`
      <ha-card>
        ${shown.map((it) => this.renderRow(it))}
        ${rest.length
          ? html`<div class="more">
              <span>+${rest.length}</span>
              ${rest.map(
                (it) => html`<span class="m"><span class="d" style="background:${it.tint}"></span>${it.label}</span>`
              )}
            </div>`
          : nothing}
      </ha-card>
    `;
  }
}

if (!customElements.get("ember-actionables")) {
  customElements.define("ember-actionables", EmberActionables);
  (window.customCards = window.customCards || []).push({
    type: "ember-actionables",
    name: "Ember Actionables",
    description: "Tiered 'what needs me now' — alert / active / ambient",
    preview: true,
  });
}
