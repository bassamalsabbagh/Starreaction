/**
 * How the Moon looks: the local NASA CGI Moon Kit images, the relief and lighting shader, the
 * star field, and the zoom readout's numbers. No Cesium import, so it stays cheap to load.
 *
 * Images (public/moon, DATA_SOURCES SRC-018, public domain, credit NASA's Scientific Visualization
 * Studio): the LROC WAC colour map (8192×4096, plus a 1024×512 preview that shows first) and two
 * normal maps computed from the LOLA elevation map (2880×1440 and 1440×720; x = east, y = north,
 * z = up; relief exaggerated 3×).
 */
import { MIN_HEIGHT_M } from './cameraControls';

const BASE = `${import.meta.env.BASE_URL}moon/`;

export const MOON_IMAGES = {
  colourPreview: `${BASE}moon-color-1k.jpg`,
  colour: `${BASE}moon-color-8k.jpg`,
  normal: `${BASE}moon-normal.jpg`,
  normalLow: `${BASE}moon-normal-low.jpg`,
} as const;

export const MOON_KIT_CREDIT = "Global imagery and relief: NASA's Scientific Visualization Studio";

/** The 8K map fades in over this, on top of the preview, so the globe is never blank. */
export const COLOUR_FADE_MS = 400;

/**
 * The light is the real Sun (Cesium's scene light, set from src/utils/lunarSky.ts for the app
 * time). The night side keeps this much of the imagery, so it stays dimly readable and beacons and
 * ellipses on it are still seen in context. Earthshine is not modelled.
 */
export const AMBIENT = 0.17;
/** How much the limb darkens (0 = none). */
export const RIM_DARKENING = 0.35;

/** Moon Trek close-up tiles fade in from this height down to TREK_FULL_M. */
export const TREK_FADE_START_M = 600_000;
export const TREK_FULL_M = 150_000;

/** The Earth seen from the Moon: NASA Earth Observatory's Blue Marble: Next Generation
 * (DATA_SOURCES SRC-021), downscaled to 1024×512. */
export const EARTH_IMAGE = `${import.meta.env.BASE_URL}earth/earth-bmng-1k.jpg`;
export const EARTH_RADIUS_M = 6_371_000;

/** The Sun's glow and the Earth fade out as you zoom in: full above this height… */
export const SKY_FULL_ABOVE_M = 3_000_000;
/** …and gone below this one, long before the surface fills the screen. */
export const SKY_GONE_BELOW_M = 1_500_000;

/** The grid's opacity, the same at every height: faint over the imagery, but plainly there. */
export const GRID_ALPHA = 0.4;

/**
 * Globe material that shades the imagery: it outputs black with an alpha equal to the shadow, so
 * it can only darken what the imagery shows. Relief comes from the normal maps; the far map is used
 * when the near one would be minified (no mipmaps for material textures), and relief fades out
 * at the poles, where the equirectangular maps are stretched.
 */
// Everything is computed in Moon-fixed world coordinates from the fragment position. Cesium only
// applies a globe material without terrain normals if its source avoids the names "normalEC" and
// "slope", so the surface frame is built here instead of read from materialInput.
export const MOON_RELIEF_SHADER = /* glsl */ `
uniform sampler2D normalNear;
uniform sampler2D normalFar;
uniform float ambient;
uniform float rimDarkening;
// South of this (z of the surface's up direction), no shading: the map layers there keep their
// true colours, unchanged by the time. -2 (the default) shades the whole Moon.
uniform float unshadedBelowZ;

// Bilinear sampling that wraps east-west, so there is no seam at +-180 degrees (Cesium's material
// textures clamp at their edges). Away from that edge the hardware filter gives the same result in
// one fetch instead of four.
vec3 sampleWrapped(sampler2D map, vec2 uv)
{
    ivec2 size = textureSize(map, 0);
    float halfTexel = 0.5 / float(size.x);
    if (uv.x > halfTexel && uv.x < 1.0 - halfTexel) return textureLod(map, uv, 0.0).rgb;
    vec2 p = uv * vec2(size) - 0.5;
    vec2 f = fract(p);
    ivec2 i = ivec2(floor(p));
    int x0 = ((i.x % size.x) + size.x) % size.x;
    int x1 = (x0 + 1) % size.x;
    int y0 = clamp(i.y, 0, size.y - 1);
    int y1 = clamp(i.y + 1, 0, size.y - 1);
    vec3 bottom = mix(texelFetch(map, ivec2(x0, y0), 0).rgb, texelFetch(map, ivec2(x1, y0), 0).rgb, f.x);
    vec3 top = mix(texelFetch(map, ivec2(x0, y1), 0).rgb, texelFetch(map, ivec2(x1, y1), 0).rgb, f.x);
    return mix(bottom, top, f.y);
}

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);

    vec3 positionWC = (czm_inverseView * vec4(-materialInput.positionToEyeEC, 1.0)).xyz;
    vec3 up = normalize(positionWC);
    vec2 uv = vec2(atan(up.y, up.x) / czm_twoPi + 0.5, asin(clamp(up.z, -1.0, 1.0)) / czm_pi + 0.5);
    if (up.z < unshadedBelowZ) {
        material.diffuse = vec3(0.0);
        material.alpha = 0.0;
        return material;
    }

    // Texels per screen pixel, measured without the jump at +-180 degrees (a whole turn, not motion).
    vec2 du = dFdx(uv);
    vec2 dv = dFdy(uv);
    du.x -= floor(du.x + 0.5);
    dv.x -= floor(dv.x + 0.5);
    vec2 texels = vec2(2880.0, 1440.0);
    float texelsPerPixel = max(length(du * texels), length(dv * texels));
    float useFar = smoothstep(0.8, 2.0, texelsPerPixel);
    // Read only the map(s) this pixel needs: most pixels use just one.
    vec3 encoded = useFar <= 0.0 ? sampleWrapped(normalNear, uv)
        : useFar >= 1.0 ? sampleWrapped(normalFar, uv)
        : mix(sampleWrapped(normalNear, uv), sampleWrapped(normalFar, uv), useFar);
    vec3 relief = encoded * 2.0 - 1.0;
    relief = normalize(mix(relief, vec3(0.0, 0.0, 1.0), smoothstep(0.96, 0.995, abs(up.z))));

    vec3 east = normalize(vec3(-up.y, up.x, 0.0) + vec3(1e-6, 0.0, 0.0));
    vec3 north = cross(up, east);
    vec3 surface = normalize(east * relief.x + north * relief.y + up * relief.z);

    // Towards the scene light: the real Sun (MoonGlobe sets it for the app time).
    vec3 toSun = czm_lightDirectionWC;
    float sphereLight = dot(up, toSun);
    float diffuse = max(dot(surface, toSun), 0.0) * smoothstep(-0.08, 0.12, sphereLight);
    // A flatter falloff than Lambert: the real Moon looks nearly evenly bright across its disc.
    float lit = ambient + (1.0 - ambient) * pow(diffuse, 0.6);

    vec3 toEye = normalize(czm_inverseViewRotation * materialInput.positionToEyeEC);
    float facing = clamp(dot(up, toEye), 0.0, 1.0);
    lit *= 1.0 - rimDarkening * pow(1.0 - facing, 3.0);

    material.diffuse = vec3(0.0);
    material.alpha = clamp(1.0 - lit, 0.0, 1.0);
    return material;
}
`;

export interface Star {
  /** Unit direction. */
  x: number;
  y: number;
  z: number;
  /** 0–1. */
  brightness: number;
  size: number;
}

/** A fixed, faint star field: the same stars every load (seeded), most of them barely visible. */
export function makeStars(count = 1600, seed = 20261026): Star[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    const bright = random() ** 3;
    stars.push({
      x: ring * Math.cos(angle),
      y: ring * Math.sin(angle),
      z,
      brightness: 0.18 + 0.6 * bright,
      size: bright > 0.6 ? 1.6 : 1,
    });
  }
  return stars;
}

/** 0 above `start`, 1 below `full`, smooth in between. */
export function fadeByHeight(height: number, start: number, full: number): number {
  const t = Math.min(1, Math.max(0, (start - height) / (start - full)));
  return t * t * (3 - 2 * t);
}

const numberFormat = new Intl.NumberFormat('en-US');

/** "3,200 km", "420 km", "42 km", "4.2 km", "850 m". */
export function formatAltitude(metres: number): string {
  if (metres < 1_000) return `${numberFormat.format(Math.round(metres / 10) * 10)} m`;
  const km = metres / 1_000;
  if (km < 10) return `${km.toFixed(1)} km`;
  if (km < 100) return `${numberFormat.format(Math.round(km))} km`;
  if (km < 1_000) return `${numberFormat.format(Math.round(km / 10) * 10)} km`;
  return `${numberFormat.format(Math.round(km / 100) * 100)} km`;
}

/** Position in the zoom range on a log scale: 100% at the whole-Moon view, 0% at the closest. */
export function zoomPercent(height: number, wholeHeight: number): number {
  const t = Math.log(height / MIN_HEIGHT_M) / Math.log(wholeHeight / MIN_HEIGHT_M);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

/** Ground metres per CSS pixel at the centre of a straight-down view (flat approximation). */
export function metresPerPixel(
  height: number,
  fovRadians: number,
  widthPx: number,
  heightPx: number,
) {
  return (2 * height * Math.tan(fovRadians / 2)) / Math.max(widthPx, heightPx, 1);
}
