/** Kaynak varsayılanları ve etkin yapılandırma. Tweak yalnızca `CONFIG` değerlerini değiştirir. */
export const DEFAULT_CONFIG = {
  player: { walkSpeed: 3.0, runSpeed: 5.2, crouchSpeed: 1.5, jumpSpeed: 5.0 },
  camera: { fov: 72, tpDistance: 3.0 },
  quake: { shakeScale: 1.0 },
  hazard: { gasDamageScale: 1.0, smokeDamageScale: 1.0 },
}

export const CONFIG = structuredClone(DEFAULT_CONFIG)
