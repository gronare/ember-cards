import type { HomeAssistant } from "custom-card-helpers";

// hass.entities / hass.devices carry the registry in the modern frontend but
// aren't in the custom-card-helpers types — narrow via this shim.
type Registry = HomeAssistant & {
  entities?: Record<string, { area_id?: string; device_id?: string }>;
  devices?: Record<string, { area_id?: string }>;
};

export function areaOf(hass: HomeAssistant, entityId: string): string | null {
  const h = hass as Registry;
  const ent = h.entities?.[entityId];
  if (!ent) return null;
  if (ent.area_id) return ent.area_id;
  const dev = ent.device_id ? h.devices?.[ent.device_id] : undefined;
  return dev?.area_id ?? null;
}

export function areaLights(hass: HomeAssistant, area: string): string[] {
  return Object.keys(hass.states).filter(
    (e) => e.startsWith("light.") && areaOf(hass, e) === area
  );
}
