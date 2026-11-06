/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * High-performance Pointillism Botanical Art Simulation.
 * Ported faithfully from NumPy / PIL generative pointillism art.
 */

// -------------------------------------------------------------
// Seeded Pseudo-Random Number Generator (Mulberry32 + Box-Muller)
// -------------------------------------------------------------
export class SeededRNG {
  private s: number;

  constructor(seed: number) {
    this.s = Math.floor(seed) >>> 0;
    if (this.s === 0) this.s = 1;
  }

  // Returns float in [0, 1)
  random(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Uniform float in [min, max)
  uniform(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  // Box-Muller transform for standard normal distribution
  normal(mean = 0, std = 1): number {
    let u1 = this.random();
    let u2 = this.random();
    while (u1 <= 1e-15) u1 = this.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }

  // Choice with probabilities or uniform
  choice<T>(items: T[], probabilities?: number[]): T {
    if (!probabilities) {
      const idx = Math.floor(this.random() * items.length);
      return items[Math.min(idx, items.length - 1)];
    }
    const r = this.random();
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      acc += probabilities[i];
      if (r <= acc) return items[i];
    }
    return items[items.length - 1];
  }

  // Permutation of an array in place (Fisher-Yates)
  permutation(n: number): Int32Array {
    const p = new Int32Array(n);
    for (let i = 0; i < n; i++) p[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    return p;
  }
}

// -------------------------------------------------------------
// Mathematical Helpers
// -------------------------------------------------------------
export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

export function smoothstep(x: number, a: number, b: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Sinc unnormalized: sin(x)/x (matching np.sinc(x / pi))
export function sinc(x: number): number {
  if (Math.abs(x) < 1e-6) return 1.0;
  return Math.sin(x) / x;
}

// Petal profile function: sin(pi * u^0.75)^0.85
export function profile(u: number): number {
  const cu = clamp(u, 0, 1);
  return Math.pow(Math.sin(Math.PI * Math.pow(cu, 0.75)), 0.85);
}

// Cubic Bezier curve evaluator with analytical tangents
export function bez(
  P: [[number, number], [number, number], [number, number], [number, number]],
  s: number
): [number, number, number, number] {
  const [P0, P1, P2, P3] = P;
  const q = 1 - s;
  const q2 = q * q;
  const s2 = s * s;
  const x = q2 * q * P0[0] + 3 * q2 * s * P1[0] + 3 * q * s2 * P2[0] + s2 * s * P3[0];
  const y = q2 * q * P0[1] + 3 * q2 * s * P1[1] + 3 * q * s2 * P2[1] + s2 * s * P3[1];
  const dx = 3 * q2 * (P1[0] - P0[0]) + 6 * q * s * (P2[0] - P1[0]) + 3 * s2 * (P3[0] - P2[0]);
  const dy = 3 * q2 * (P1[1] - P0[1]) + 6 * q * s * (P2[1] - P1[1]) + 3 * s2 * (P3[1] - P2[1]);
  return [x, y, dx, dy];
}

// Color mixing
export function mixcol(
  liveR: number, liveG: number, liveB: number,
  wiltR: number, wiltG: number, wiltB: number,
  w: number
): [number, number, number] {
  return [
    liveR + (wiltR - liveR) * w,
    liveG + (wiltG - liveG) * w,
    liveB + (wiltB - liveB) * w,
  ];
}

// -------------------------------------------------------------
// Keyframes & Botanical Timeline
// -------------------------------------------------------------
// [t, stem, size, bloom, wilt, leaf, glow]
export const KEYS: number[][] = [
  [0.0, 0.00, 0.00, 0.00, 0.0, 0.00, 0.00],
  [5.0, 0.42, 0.22, 0.00, 0.0, 0.25, 0.00],
  [10.0, 0.62, 0.42, 0.00, 0.0, 0.50, 0.35],
  [16.0, 0.80, 0.68, 0.50, 0.0, 0.72, 0.55],
  [24.0, 1.00, 1.00, 1.00, 0.0, 1.00, 1.00],
  [30.0, 1.00, 1.00, 1.00, 0.0, 1.00, 1.00],
  [39.0, 0.98, 0.85, 0.55, 1.0, 0.92, 0.00],
  [45.0, 0.98, 0.85, 0.55, 1.0, 0.90, 0.00],
];

export const T_END = KEYS[KEYS.length - 1][0]; // 45.0s

export interface FlowerState {
  stem: number;
  size: number;
  bloom: number;
  wilt: number;
  leaf: number;
  glow: number;
}

// Catmull-Rom spline interpolation through keyframes
export function getState(t: number): FlowerState {
  const ct = clamp(t, 0.0, T_END);
  const n = KEYS.length;
  let i = 0;
  for (let k = 0; k < n - 1; k++) {
    if (ct >= KEYS[k][0]) {
      i = k;
    }
  }
  if (i > n - 2) i = n - 2;

  const t0 = KEYS[i][0];
  const t1 = KEYS[i + 1][0];
  const u = (ct - t0) / (t1 - t0);

  const idx0 = Math.max(i - 1, 0);
  const idx1 = i;
  const idx2 = i + 1;
  const idx3 = Math.min(i + 2, n - 1);

  const res: number[] = [];
  for (let col = 1; col <= 6; col++) {
    const p0 = KEYS[idx0][col];
    const p1 = KEYS[idx1][col];
    const p2 = KEYS[idx2][col];
    const p3 = KEYS[idx3][col];

    const v =
      0.5 *
      (2 * p1 +
        (p2 - p0) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
        (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
    res.push(clamp(v, 0, 1));
  }

  return {
    stem: res[0],
    size: res[1],
    bloom: res[2],
    wilt: res[3],
    leaf: res[4],
    glow: res[5],
  };
}

// -------------------------------------------------------------
// Palettes and Theme presets
// -------------------------------------------------------------
export type RGB = [number, number, number];

export interface ColorTheme {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  soil: RGB[];
  stem: RGB[];
  stemWilt: RGB[];
  leaf: RGB[];
  leafWilt: RGB[];
  rib: RGB[];
  wilt: RGB[];
  rim: RGB[];
  hi: RGB[];
  gold: RGB[];
  stamen: RGB[];
  stamenWilt: RGB[];
  haloCol: RGB;
  ringCol: RGB;
  sparkA: RGB;
  sparkB: RGB;
  petalLayers: RGB[][];
}

export const THEMES: Record<string, ColorTheme> = {
  original: {
    id: "original",
    name: "Cosmic Lilac",
    nameAr: "الليلك الكوني (الأصلي)",
    description: "The mystical amethyst, violet, and gold palette from the original Python script.",
    soil: [[34, 25, 20], [50, 36, 28], [68, 50, 37], [88, 65, 47], [108, 82, 60], [64, 58, 52]],
    stem: [[62, 38, 120], [100, 58, 165], [140, 84, 200], [60, 160, 140]],
    stemWilt: [[120, 88, 66], [96, 66, 52], [140, 108, 76]],
    leaf: [[60, 150, 140], [80, 120, 175], [130, 80, 195], [175, 105, 215]],
    leafWilt: [[130, 100, 70], [104, 76, 58], [146, 116, 84]],
    rib: [[210, 180, 255], [170, 230, 220]],
    wilt: [[150, 86, 128], [116, 64, 108], [88, 52, 88], [126, 94, 104], [104, 72, 56]],
    rim: [[205, 165, 255], [255, 190, 250], [170, 140, 255]],
    hi: [[235, 215, 255], [255, 225, 250]],
    gold: [[255, 214, 110], [255, 238, 170], [255, 184, 90]],
    stamen: [[255, 240, 255], [255, 215, 235], [255, 230, 150], [255, 190, 80]],
    stamenWilt: [[140, 112, 84], [120, 96, 72]],
    haloCol: [150, 70, 240],
    ringCol: [210, 145, 255],
    sparkA: [255, 215, 255],
    sparkB: [255, 150, 235],
    petalLayers: [
      [[210, 80, 225], [170, 58, 225], [128, 50, 218], [96, 44, 205], [78, 42, 185]],
      [[255, 150, 235], [245, 92, 218], [205, 62, 218], [150, 52, 222]],
      [[255, 205, 245], [255, 135, 232], [238, 84, 216], [195, 62, 226]],
      [[255, 238, 252], [255, 185, 242], [255, 125, 228]],
    ],
  },
  desertRose: {
    id: "desertRose",
    name: "Solar Desert Rose",
    nameAr: "وردة الصحراء الشمسية",
    description: "Warm desert sunset hues, amber, terracotta, and radiant solar gold.",
    soil: [[40, 24, 18], [60, 36, 26], [85, 52, 36], [115, 72, 48], [140, 95, 65], [75, 58, 45]],
    stem: [[85, 50, 30], [140, 75, 35], [190, 110, 45], [70, 145, 110]],
    stemWilt: [[110, 70, 50], [90, 55, 40], [130, 88, 60]],
    leaf: [[65, 140, 105], [95, 155, 80], [165, 120, 50], [205, 145, 60]],
    leafWilt: [[125, 90, 55], [100, 70, 45], [140, 105, 70]],
    rib: [[255, 225, 175], [230, 195, 140]],
    wilt: [[160, 90, 60], [130, 70, 50], [95, 50, 40], [140, 95, 70], [110, 75, 50]],
    rim: [[255, 210, 150], [255, 180, 120], [255, 230, 180]],
    hi: [[255, 245, 220], [255, 235, 195]],
    gold: [[255, 225, 120], [255, 240, 175], [255, 190, 95]],
    stamen: [[255, 250, 230], [255, 220, 170], [255, 195, 110], [240, 140, 60]],
    stamenWilt: [[135, 95, 65], [110, 80, 55]],
    haloCol: [240, 140, 50],
    ringCol: [255, 190, 100],
    sparkA: [255, 245, 200],
    sparkB: [255, 160, 90],
    petalLayers: [
      [[235, 95, 60], [215, 75, 50], [185, 55, 40], [150, 45, 35], [120, 35, 30]],
      [[255, 145, 80], [245, 115, 65], [215, 85, 50], [175, 65, 45]],
      [[255, 190, 110], [255, 155, 85], [240, 120, 65], [205, 95, 55]],
      [[255, 225, 160], [255, 185, 120], [255, 150, 90]],
    ],
  },
  emeraldAurora: {
    id: "emeraldAurora",
    name: "Bioluminescent Aurora",
    nameAr: "الشفق الزمردي الحيوي",
    description: "Deep sea phosphorescence with vivid cyan, emerald, jade, and electric turquoise.",
    soil: [[18, 28, 30], [25, 42, 45], [35, 60, 62], [50, 82, 85], [68, 105, 108], [40, 58, 60]],
    stem: [[25, 75, 85], [35, 115, 125], [45, 160, 165], [35, 170, 120]],
    stemWilt: [[65, 85, 80], [50, 70, 65], [80, 105, 95]],
    leaf: [[35, 160, 140], [45, 180, 160], [60, 195, 185], [95, 220, 205]],
    leafWilt: [[70, 100, 95], [55, 80, 75], [90, 120, 110]],
    rib: [[175, 255, 240], [140, 245, 220]],
    wilt: [[60, 105, 100], [45, 85, 80], [35, 65, 62], [75, 115, 110], [50, 80, 78]],
    rim: [[150, 255, 235], [180, 255, 245], [130, 240, 220]],
    hi: [[210, 255, 250], [230, 255, 252]],
    gold: [[140, 255, 210], [180, 255, 230], [100, 240, 180]],
    stamen: [[230, 255, 250], [180, 255, 235], [130, 245, 210], [80, 220, 180]],
    stamenWilt: [[70, 100, 90], [55, 80, 75]],
    haloCol: [50, 220, 200],
    ringCol: [110, 245, 225],
    sparkA: [200, 255, 245],
    sparkB: [80, 230, 210],
    petalLayers: [
      [[30, 160, 170], [25, 135, 150], [20, 110, 130], [15, 85, 105], [12, 65, 85]],
      [[55, 205, 205], [40, 175, 185], [30, 145, 160], [25, 115, 135]],
      [[105, 235, 225], [75, 210, 205], [50, 180, 185], [35, 150, 160]],
      [[165, 255, 240], [125, 235, 225], [85, 210, 205]],
    ],
  },
  sakuraBlossom: {
    id: "sakuraBlossom",
    name: "Sakura Blossom",
    nameAr: "أزهار الساكورا اليابانية",
    description: "Graceful cherry blossom petals with delicate blush pink, crimson, and pearl highlights.",
    soil: [[35, 25, 26], [52, 36, 38], [72, 48, 52], [96, 64, 68], [118, 80, 85], [68, 54, 56]],
    stem: [[80, 45, 60], [125, 65, 85], [170, 95, 115], [85, 150, 120]],
    stemWilt: [[115, 80, 75], [92, 60, 58], [135, 98, 92]],
    leaf: [[75, 145, 125], [105, 165, 140], [145, 120, 140], [185, 130, 155]],
    leafWilt: [[125, 95, 85], [100, 72, 65], [142, 110, 100]],
    rib: [[255, 215, 230], [240, 190, 210]],
    wilt: [[155, 85, 95], [120, 65, 75], [90, 50, 60], [130, 90, 95], [105, 70, 72]],
    rim: [[255, 200, 220], [255, 225, 238], [245, 180, 205]],
    hi: [[255, 240, 248], [255, 248, 252]],
    gold: [[255, 200, 140], [255, 225, 180], [255, 170, 110]],
    stamen: [[255, 245, 250], [255, 215, 230], [255, 195, 160], [255, 160, 130]],
    stamenWilt: [[135, 100, 90], [115, 82, 75]],
    haloCol: [245, 110, 160],
    ringCol: [255, 180, 210],
    sparkA: [255, 235, 245],
    sparkB: [255, 140, 185],
    petalLayers: [
      [[225, 70, 110], [195, 55, 95], [165, 45, 80], [130, 38, 70], [100, 32, 58]],
      [[255, 115, 155], [240, 90, 135], [210, 70, 115], [165, 55, 95]],
      [[255, 175, 200], [255, 140, 175], [240, 105, 150], [200, 80, 125]],
      [[255, 220, 235], [255, 185, 210], [255, 145, 180]],
    ],
  },
};

// -------------------------------------------------------------
// Precalculated Circle Splat Offsets & Lookup Tables
// -------------------------------------------------------------
interface SplatOffset {
  dx: number;
  dy: number;
  d2: number;
}

const ALL_OFFSETS: SplatOffset[] = [];
for (let dy = -3; dy <= 3; dy++) {
  for (let dx = -3; dx <= 3; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 <= 9) {
      ALL_OFFSETS.push({ dx, dy, d2 });
    }
  }
}
// Sort by distance squared, matching Python's sort
ALL_OFFSETS.sort((a, b) => a.d2 - b.d2 || a.dy - b.dy || a.dx - b.dx);

// -------------------------------------------------------------
// Palette Pick Helper
// -------------------------------------------------------------
export function palettePick(
  rng: SeededRNG,
  pal: RGB[],
  g: number,
  spread = 0.55,
  jitter = 0.07
): RGB {
  const n = pal.length;
  const x = clamp(g, 0, 1) * (n - 1) + rng.normal(0, spread);
  const idx = clamp(Math.round(x), 0, n - 1);
  const base = pal[idx];
  const factor = 1 + rng.normal(0, jitter);
  return [
    clamp(base[0] * factor, 0, 255),
    clamp(base[1] * factor, 0, 255),
    clamp(base[2] * factor, 0, 255),
  ];
}

// Layer definition in Python
export interface LayerDef {
  n: number;
  ac: number;
  ao: number;
  kc: number;
  ko: number;
  L: number;
  wc: number;
  wo: number;
  d: number;
  off: number;
  palIndex: number;
}

const LAYERS_CONFIG: LayerDef[] = [
  { n: 8, ac: 0.6, ao: 1.0, kc: -1.2, ko: 0.45, L: 1.0, wc: 0.2, wo: 0.34, d: 1150, off: 0.0, palIndex: 0 },
  { n: 6, ac: 0.48, ao: 0.68, kc: -1.05, ko: 0.15, L: 0.88, wc: 0.19, wo: 0.31, d: 950, off: 0.4, palIndex: 1 },
  { n: 5, ac: 0.36, ao: 0.46, kc: -0.85, ko: -0.05, L: 0.72, wc: 0.17, wo: 0.27, d: 760, off: 0.2, palIndex: 2 },
  { n: 4, ac: 0.22, ao: 0.32, kc: -0.5, ko: -0.1, L: 0.46, wc: 0.14, wo: 0.22, d: 480, off: 0.55, palIndex: 3 },
];

const LEAF_DEFS = [
  { s: 0.1, dir: +1, lfac: 1.0, a0: 0.55, c: -0.8 },
  { s: 0.16, dir: -1, lfac: 0.9, a0: 0.5, c: -0.85 },
  { s: 0.4, dir: +1, lfac: 0.7, a0: 0.95, c: -0.7 },
  { s: 0.33, dir: -1, lfac: 0.62, a0: 0.9, c: -0.65 },
];

// Area U distribution using rejection sampling
function sampleAreaU(rng: SeededRNG, count: number): Float32Array {
  const out = new Float32Array(count);
  let filled = 0;
  while (filled < count) {
    const u = rng.random();
    if (rng.random() < profile(u)) {
      out[filled++] = u;
    }
  }
  return out;
}

function sampleV(rng: SeededRNG, count: number, rim = 0.14): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (rng.random() < rim) {
      const sign = rng.random() < 0.5 ? -1 : 1;
      out[i] = sign * rng.uniform(0.88, 1.0);
    } else {
      out[i] = rng.uniform(-1, 1);
    }
  }
  return out;
}

// -------------------------------------------------------------
// Plant Generative Model
// -------------------------------------------------------------
export class PlantSimulation {
  public W: number;
  public H: number;
  public seed: number;
  public theme: ColorTheme;
  private rng: SeededRNG;

  public cx: number;
  public y0: number;
  public Ls: number;
  public Lf: number;

  // Base canvas pixel cache (Soil + Stones)
  public basePixels: Uint32Array;

  // Crumb particles
  public cr: {
    x: Float32Array;
    y: Float32Array;
    amp: Float32Array;
    delay: Float32Array;
    colR: Float32Array;
    colG: Float32Array;
    colB: Float32Array;
    rad: Float32Array;
    count: number;
  };

  // Stem dots
  public stem: {
    s: Float32Array;
    lat: Float32Array;
    liveR: Float32Array;
    liveG: Float32Array;
    liveB: Float32Array;
    wiltR: Float32Array;
    wiltG: Float32Array;
    wiltB: Float32Array;
    rn: Float32Array;
    rad: Float32Array;
    count: number;
  };

  // Head petal dots
  public head: {
    th: Float32Array;
    aj: Float32Array;
    pj: Float32Array;
    wj: Float32Array;
    u: Float32Array;
    v: Float32Array;
    ac: Float32Array;
    ao: Float32Array;
    kc: Float32Array;
    ko: Float32Array;
    L: Float32Array;
    wc: Float32Array;
    wo: Float32Array;
    liveR: Float32Array;
    liveG: Float32Array;
    liveB: Float32Array;
    wiltR: Float32Array;
    wiltG: Float32Array;
    wiltB: Float32Array;
    rn: Float32Array;
    rad: Float32Array;
    sp: Float32Array;
    count: number;
  };

  // Stamens
  public st: {
    th: Float32Array;
    beta: Float32Array;
    ell: Float32Array;
    t: Float32Array;
    liveR: Float32Array;
    liveG: Float32Array;
    liveB: Float32Array;
    wiltR: Float32Array;
    wiltG: Float32Array;
    wiltB: Float32Array;
    rad: Float32Array;
    count: number;
  };

  // Leaves
  public leaf: {
    lid: Int8Array;
    u: Float32Array;
    v: Float32Array;
    liveR: Float32Array;
    liveG: Float32Array;
    liveB: Float32Array;
    wiltR: Float32Array;
    wiltG: Float32Array;
    wiltB: Float32Array;
    rn: Float32Array;
    rad: Float32Array;
    count: number;
  };

  // FX (Halo, Ring, Sparks, Falling petals)
  public halo: {
    a: Float32Array;
    r: Float32Array;
    b: Float32Array;
    fl: Float32Array;
    count: number;
  };

  public ring: {
    cf: Float32Array;
    cj: Int8Array;
    rho: Float32Array;
    a: Float32Array;
    fl: Float32Array;
    count: number;
  };

  public spark: {
    a: Float32Array;
    rho: Float32Array;
    ph: Float32Array;
    sp: Float32Array;
    rad: Float32Array;
    hue: Float32Array;
    count: number;
  };

  public fall: {
    r0: Float32Array;
    ox: Float32Array;
    oy: Float32Array;
    xl: Float32Array;
    yl: Float32Array;
    ph: Float32Array;
    colR: Float32Array;
    colG: Float32Array;
    colB: Float32Array;
    rad: Float32Array;
    count: number;
  };

  // Preallocated buffer for rendering
  private activePixels: Uint32Array;
  private batchX: Float32Array;
  private batchY: Float32Array;
  private batchR: Float32Array;
  private batchG: Float32Array;
  private batchB: Float32Array;
  private batchRad: Float32Array;
  private batchZ: Float32Array;
  private batchIndices: Int32Array;
  private batchCount = 0;
  private maxBatchSize = 65536;

  constructor(W = 640, H = 640, seed = 5, themeId = "original") {
    this.W = W;
    this.H = H;
    this.seed = seed;
    this.theme = THEMES[themeId] || THEMES.original;
    this.rng = new SeededRNG(seed);

    this.cx = W / 2;
    this.y0 = H * 0.8;
    this.Ls = H * 0.38;
    this.Lf = H * 0.235;

    this.basePixels = new Uint32Array(W * H);
    this.activePixels = new Uint32Array(W * H);

    this.batchX = new Float32Array(this.maxBatchSize);
    this.batchY = new Float32Array(this.maxBatchSize);
    this.batchR = new Float32Array(this.maxBatchSize);
    this.batchG = new Float32Array(this.maxBatchSize);
    this.batchB = new Float32Array(this.maxBatchSize);
    this.batchRad = new Float32Array(this.maxBatchSize);
    this.batchZ = new Float32Array(this.maxBatchSize);
    this.batchIndices = new Int32Array(this.maxBatchSize);

    // Initialize all botanical structures
    this.cr = this.buildSoil();
    this.stem = this.buildStem();
    this.head = this.buildHead();
    this.st = this.buildStamens();
    this.leaf = this.buildLeaves();
    const fx = this.buildFx();
    this.halo = fx.halo;
    this.ring = fx.ring;
    this.spark = fx.spark;
    this.fall = fx.fall;
  }

  // Soil ground topography
  public surface(x: number): number {
    const H = this.H;
    const cx = this.cx;
    const W = this.W;
    const dxNorm = (x - cx) / (0.2 * W);
    return (
      this.y0 -
      0.022 * H * Math.exp(-(dxNorm * dxNorm)) -
      0.003 * H * Math.sin(x * 0.045) -
      0.002 * H * Math.sin(x * 0.13 + 1.3)
    );
  }

  private splatOnBuffer(
    buffer: Uint32Array,
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    rad: number,
    nmax = 13
  ) {
    const W = this.W;
    const H = this.H;
    const xi = Math.round(x);
    const yi = Math.round(y);
    const rad2 = rad * rad + 0.01;
    const limit = Math.min(nmax, ALL_OFFSETS.length);

    const cr = clamp(Math.round(r), 0, 255);
    const cg = clamp(Math.round(g), 0, 255);
    const cb = clamp(Math.round(b), 0, 255);
    // 32-bit pixel: 0xAABBGGRR (little-endian: R, G, B, A in bytes)
    const color32 = (255 << 24) | (cb << 16) | (cg << 8) | cr;

    for (let i = 0; i < limit; i++) {
      const off = ALL_OFFSETS[i];
      if (off.d2 <= rad2) {
        const px = xi + off.dx;
        const py = yi + off.dy;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          buffer[py * W + px] = color32;
        }
      }
    }
  }

  private buildSoil() {
    const { W, H, rng, theme } = this;
    const n = 26000;
    // Clear base buffer to solid black with full opacity
    this.basePixels.fill(0xff000000);

    for (let i = 0; i < n; i++) {
      const x = rng.uniform(0, W);
      const d = Math.pow(rng.random(), 1.5) * 0.14 * H;
      const y = this.surface(x) + d;
      const depth = d / (0.14 * H);
      const edge = Math.pow(clamp(Math.min(x, W - x) / (0.2 * W), 0, 1), 0.8);
      const clump =
        0.5 + 0.5 * Math.sin(x * 0.07 + y * 0.05) * Math.sin(y * 0.11 - x * 0.03);
      const bright =
        Math.pow(1 - depth, 0.8) *
        edge *
        (0.55 + 0.35 * clump + 0.35 * rng.random());

      const baseCol = palettePick(rng, theme.soil, rng.random(), 1.0);
      const r = baseCol[0] * bright;
      const g = baseCol[1] * bright;
      const b = baseCol[2] * bright;
      const rad = rng.choice([1.0, 1.5, 2.0], [0.4, 0.4, 0.2]);

      this.splatOnBuffer(this.basePixels, x, y, r, g, b, rad, 13);
    }

    // Pebbles / Rocks
    const k = 170;
    const rockPals: RGB[] = [
      [58, 52, 48],
      [84, 74, 64],
      [104, 90, 76],
      [46, 38, 32],
    ];
    for (let i = 0; i < k; i++) {
      const px = rng.uniform(0.05 * W, 0.95 * W);
      const py = this.surface(px) + Math.pow(rng.random(), 1.3) * 0.1 * H;
      const pc = palettePick(rng, rockPals, rng.random(), 0.7);
      const edgeFactor = Math.pow(
        clamp(Math.min(px, W - px) / (0.2 * W), 0, 1),
        0.8
      );
      const rad = rng.choice([2.0, 3.0], [0.6, 0.4]);
      this.splatOnBuffer(
        this.basePixels,
        px,
        py,
        pc[0] * edgeFactor,
        pc[1] * edgeFactor,
        pc[2] * edgeFactor,
        rad,
        29
      );
    }

    // Animated Soil Crumbs (m = 520)
    const m = 520;
    const cr = {
      x: new Float32Array(m),
      y: new Float32Array(m),
      amp: new Float32Array(m),
      delay: new Float32Array(m),
      colR: new Float32Array(m),
      colG: new Float32Array(m),
      colB: new Float32Array(m),
      rad: new Float32Array(m),
      count: m,
    };

    for (let i = 0; i < m; i++) {
      const cx = this.cx + rng.normal(0, 0.03 * H);
      cr.x[i] = cx;
      cr.y[i] = this.surface(cx) - rng.random() * 0.006 * H;
      cr.amp[i] = H * 0.05 * Math.pow(rng.random(), 2.2);
      cr.delay[i] = rng.uniform(0, 2.5);
      const col = palettePick(rng, theme.soil, rng.uniform(0.3, 1), 0.8);
      cr.colR[i] = col[0] * 0.8;
      cr.colG[i] = col[1] * 0.8;
      cr.colB[i] = col[2] * 0.8;
      cr.rad[i] = rng.choice([1.0, 1.5, 2.0], [0.4, 0.4, 0.2]);
    }

    return cr;
  }

  private buildStem() {
    const { rng, theme } = this;
    const n = 3600;
    const stem = {
      s: new Float32Array(n),
      lat: new Float32Array(n),
      liveR: new Float32Array(n),
      liveG: new Float32Array(n),
      liveB: new Float32Array(n),
      wiltR: new Float32Array(n),
      wiltG: new Float32Array(n),
      wiltB: new Float32Array(n),
      rn: new Float32Array(n),
      rad: new Float32Array(n),
      count: n,
    };

    const perm = rng.permutation(n);
    for (let i = 0; i < n; i++) {
      const pIdx = perm[i];
      const s = rng.random();
      let lat = rng.uniform(-1, 1);
      if (rng.random() < 0.18) {
        lat = (lat < 0 ? -1 : 1) * rng.uniform(0.85, 1.0);
      }

      let live: RGB;
      if (rng.random() < 0.12 && theme.stem.length > 3) {
        const factor = 1 + rng.normal(0, 0.08);
        live = [
          theme.stem[3][0] * factor,
          theme.stem[3][1] * factor,
          theme.stem[3][2] * factor,
        ];
      } else {
        live = palettePick(rng, theme.stem.slice(0, 3), s * 0.8 + rng.random() * 0.2);
      }
      const wilt = palettePick(rng, theme.stemWilt, rng.random(), 0.8);

      stem.s[pIdx] = s;
      stem.lat[pIdx] = lat;
      stem.liveR[pIdx] = live[0];
      stem.liveG[pIdx] = live[1];
      stem.liveB[pIdx] = live[2];
      stem.wiltR[pIdx] = wilt[0];
      stem.wiltG[pIdx] = wilt[1];
      stem.wiltB[pIdx] = wilt[2];
      stem.rn[pIdx] = rng.random();
      stem.rad[pIdx] = rng.choice([1.0, 1.5, 2.0], [0.35, 0.45, 0.2]);
    }

    return stem;
  }

  private buildHead() {
    const { rng, theme } = this;
    let totalDots = 0;
    for (const Ly of LAYERS_CONFIG) {
      totalDots += Ly.n * Ly.d;
    }

    const head = {
      th: new Float32Array(totalDots),
      aj: new Float32Array(totalDots),
      pj: new Float32Array(totalDots),
      wj: new Float32Array(totalDots),
      u: new Float32Array(totalDots),
      v: new Float32Array(totalDots),
      ac: new Float32Array(totalDots),
      ao: new Float32Array(totalDots),
      kc: new Float32Array(totalDots),
      ko: new Float32Array(totalDots),
      L: new Float32Array(totalDots),
      wc: new Float32Array(totalDots),
      wo: new Float32Array(totalDots),
      liveR: new Float32Array(totalDots),
      liveG: new Float32Array(totalDots),
      liveB: new Float32Array(totalDots),
      wiltR: new Float32Array(totalDots),
      wiltG: new Float32Array(totalDots),
      wiltB: new Float32Array(totalDots),
      rn: new Float32Array(totalDots),
      rad: new Float32Array(totalDots),
      sp: new Float32Array(totalDots),
      count: totalDots,
    };

    let writeIdx = 0;
    for (let lyIdx = 0; lyIdx < LAYERS_CONFIG.length; lyIdx++) {
      const Ly = LAYERS_CONFIG[lyIdx];
      const d = Ly.d;
      const pal = theme.petalLayers[Ly.palIndex] || theme.petalLayers[0];

      for (let i = 0; i < Ly.n; i++) {
        const th = (2 * Math.PI * i) / Ly.n + Ly.off + rng.normal(0, 0.1);
        const aj = rng.normal(0, 0.06);
        const lj = rng.uniform(0.92, 1.08);
        const pj = rng.random();
        const wj = rng.uniform(-0.5, 0.5);

        const uArr = sampleAreaU(rng, d);
        const vArr = sampleV(rng, d, 0.14);

        for (let pt = 0; pt < d; pt++) {
          const u = uArr[pt];
          const v = vArr[pt];
          let col = palettePick(rng, pal, u + rng.normal(0, 0.1));

          if (Math.abs(v) > 0.86 && rng.random() < 0.55) {
            col = palettePick(rng, theme.rim, rng.random());
          }
          if (rng.random() < 0.04) {
            col = palettePick(rng, theme.hi, rng.random());
          }
          if (rng.random() < 0.02 && u < 0.55) {
            col = palettePick(rng, theme.gold, rng.random());
          }

          const wilt = palettePick(rng, theme.wilt, 0.4 * u + 0.6 * rng.random(), 0.7);

          const idx = writeIdx++;
          head.th[idx] = th;
          head.aj[idx] = aj;
          head.pj[idx] = pj;
          head.wj[idx] = wj;
          head.u[idx] = u;
          head.v[idx] = v;
          head.ac[idx] = Ly.ac;
          head.ao[idx] = Ly.ao;
          head.kc[idx] = Ly.kc;
          head.ko[idx] = Ly.ko;
          head.L[idx] = Ly.L * lj;
          head.wc[idx] = Ly.wc;
          head.wo[idx] = Ly.wo;
          head.liveR[idx] = col[0];
          head.liveG[idx] = col[1];
          head.liveB[idx] = col[2];
          head.wiltR[idx] = wilt[0];
          head.wiltG[idx] = wilt[1];
          head.wiltB[idx] = wilt[2];
          head.rn[idx] = rng.random();
          head.rad[idx] = rng.choice([1.0, 1.5, 2.0], [0.3, 0.45, 0.25]);
          head.sp[idx] = profile(u);
        }
      }
    }

    // Permute in place
    const perm = rng.permutation(totalDots);
    this.permuteHeadInPlace(head, perm);
    return head;
  }

  private permuteHeadInPlace(h: PlantSimulation['head'], perm: Int32Array) {
    const n = h.count;
    // Permute using copy
    const tempFloat = new Float32Array(n);
    const reorder = (arr: Float32Array) => {
      tempFloat.set(arr);
      for (let i = 0; i < n; i++) arr[i] = tempFloat[perm[i]];
    };

    reorder(h.th);
    reorder(h.aj);
    reorder(h.pj);
    reorder(h.wj);
    reorder(h.u);
    reorder(h.v);
    reorder(h.ac);
    reorder(h.ao);
    reorder(h.kc);
    reorder(h.ko);
    reorder(h.L);
    reorder(h.wc);
    reorder(h.wo);
    reorder(h.liveR);
    reorder(h.liveG);
    reorder(h.liveB);
    reorder(h.wiltR);
    reorder(h.wiltG);
    reorder(h.wiltB);
    reorder(h.rn);
    reorder(h.rad);
    reorder(h.sp);
  }

  private buildStamens() {
    const { rng, theme } = this;
    const n = 700;
    const nf = 60;

    const fTh = new Float32Array(nf);
    const fBeta = new Float32Array(nf);
    const fEll = new Float32Array(nf);
    for (let i = 0; i < nf; i++) {
      fTh[i] = rng.uniform(0, 2 * Math.PI);
      fBeta[i] = rng.uniform(0.2, 0.85);
      fEll[i] = rng.uniform(0.3, 0.55);
    }

    const st = {
      th: new Float32Array(n),
      beta: new Float32Array(n),
      ell: new Float32Array(n),
      t: new Float32Array(n),
      liveR: new Float32Array(n),
      liveG: new Float32Array(n),
      liveB: new Float32Array(n),
      wiltR: new Float32Array(n),
      wiltG: new Float32Array(n),
      wiltB: new Float32Array(n),
      rad: new Float32Array(n),
      count: n,
    };

    for (let i = 0; i < n; i++) {
      const fid = Math.floor(rng.uniform(0, nf));
      const tVal = 1 - Math.pow(rng.random(), 1.6);
      const live = palettePick(rng, theme.stamen, tVal, 0.35);
      const wilt = palettePick(rng, theme.stamenWilt, rng.random(), 0.6);

      st.th[i] = fTh[fid];
      st.beta[i] = fBeta[fid];
      st.ell[i] = fEll[fid];
      st.t[i] = tVal;
      st.liveR[i] = live[0];
      st.liveG[i] = live[1];
      st.liveB[i] = live[2];
      st.wiltR[i] = wilt[0];
      st.wiltG[i] = wilt[1];
      st.wiltB[i] = wilt[2];
      st.rad[i] = tVal > 0.88 ? 2.0 : rng.choice([1.0, 1.5]);
    }

    return st;
  }

  private buildLeaves() {
    const { rng, theme } = this;
    const d = 900;
    const total = d * LEAF_DEFS.length;

    const leaf = {
      lid: new Int8Array(total),
      u: new Float32Array(total),
      v: new Float32Array(total),
      liveR: new Float32Array(total),
      liveG: new Float32Array(total),
      liveB: new Float32Array(total),
      wiltR: new Float32Array(total),
      wiltG: new Float32Array(total),
      wiltB: new Float32Array(total),
      rn: new Float32Array(total),
      rad: new Float32Array(total),
      count: total,
    };

    let writeIdx = 0;
    for (let j = 0; j < LEAF_DEFS.length; j++) {
      const uArr = sampleAreaU(rng, d);
      const vArr = sampleV(rng, d, 0.1);

      for (let k = 0; k < d; k++) {
        const u = uArr[k];
        let v = vArr[k];
        let isRib = false;
        if (rng.random() < 0.09) {
          isRib = true;
          v = rng.normal(0, 0.03);
        }

        let live: RGB;
        if (isRib) {
          live = palettePick(rng, theme.rib, rng.random());
        } else {
          live = palettePick(rng, theme.leaf, u + rng.normal(0, 0.1));
        }
        const wilt = palettePick(rng, theme.leafWilt, rng.random(), 0.8);

        const idx = writeIdx++;
        leaf.lid[idx] = j;
        leaf.u[idx] = u;
        leaf.v[idx] = v;
        leaf.liveR[idx] = live[0];
        leaf.liveG[idx] = live[1];
        leaf.liveB[idx] = live[2];
        leaf.wiltR[idx] = wilt[0];
        leaf.wiltG[idx] = wilt[1];
        leaf.wiltB[idx] = wilt[2];
        leaf.rn[idx] = rng.random();
        leaf.rad[idx] = rng.choice([1.0, 1.5, 2.0], [0.35, 0.45, 0.2]);
      }
    }

    return leaf;
  }

  private buildFx() {
    const { rng, theme, H } = this;

    // 1. Halo (1800 dots)
    const nh = 1800;
    const halo = {
      a: new Float32Array(nh),
      r: new Float32Array(nh),
      b: new Float32Array(nh),
      fl: new Float32Array(nh),
      count: nh,
    };
    for (let i = 0; i < nh; i++) {
      const r = Math.min(Math.abs(rng.normal(0, 0.55)), 1.6);
      halo.a[i] = rng.uniform(0, 2 * Math.PI);
      halo.r[i] = r;
      halo.b[i] = Math.pow(1 - r / 1.6, 1.5) * 0.55;
      halo.fl[i] = rng.random();
    }

    // 2. Orbital Ring (1720 dots)
    const ringDots: { cf: number; cj: number; rho: number; a: number; fl: number }[] = [];
    for (let j = 0; j < 7; j++) {
      const m = j === 0 ? 700 : 170;
      const cf = j === 0 ? 0.0 : 0.5;
      const cj = Math.max(j - 1, 0);
      const rho = j === 0 ? 1.0 : 0.5;
      for (let k = 0; k < m; k++) {
        ringDots.push({
          cf,
          cj,
          rho,
          a: rng.uniform(0, 2 * Math.PI),
          fl: rng.random(),
        });
      }
    }
    const nr = ringDots.length;
    const ring = {
      cf: new Float32Array(nr),
      cj: new Int8Array(nr),
      rho: new Float32Array(nr),
      a: new Float32Array(nr),
      fl: new Float32Array(nr),
      count: nr,
    };
    for (let i = 0; i < nr; i++) {
      ring.cf[i] = ringDots[i].cf;
      ring.cj[i] = ringDots[i].cj;
      ring.rho[i] = ringDots[i].rho;
      ring.a[i] = ringDots[i].a;
      ring.fl[i] = ringDots[i].fl;
    }

    // 3. Sparks (280 rising sparks)
    const ns = 280;
    const spark = {
      a: new Float32Array(ns),
      rho: new Float32Array(ns),
      ph: new Float32Array(ns),
      sp: new Float32Array(ns),
      rad: new Float32Array(ns),
      hue: new Float32Array(ns),
      count: ns,
    };
    for (let i = 0; i < ns; i++) {
      spark.a[i] = rng.uniform(0, 2 * Math.PI);
      spark.rho[i] = rng.random();
      spark.ph[i] = rng.random();
      spark.sp[i] = rng.uniform(0.6, 1.4);
      spark.rad[i] = rng.choice([1.0, 2.0], [0.7, 0.3]);
      spark.hue[i] = rng.random();
    }

    // 4. Falling Wilted Petals (260 falling dots)
    const nf = 260;
    const fall = {
      r0: new Float32Array(nf),
      ox: new Float32Array(nf),
      oy: new Float32Array(nf),
      xl: new Float32Array(nf),
      yl: new Float32Array(nf),
      ph: new Float32Array(nf),
      colR: new Float32Array(nf),
      colG: new Float32Array(nf),
      colB: new Float32Array(nf),
      rad: new Float32Array(nf),
      count: nf,
    };
    for (let i = 0; i < nf; i++) {
      const xl = this.cx + rng.normal(0, 0.12 * H);
      const col = palettePick(rng, theme.wilt, rng.random(), 0.8);
      fall.r0[i] = rng.random();
      fall.ox[i] = rng.normal(0, 1);
      fall.oy[i] = rng.normal(0, 1);
      fall.xl[i] = xl;
      fall.yl[i] = this.surface(xl) - rng.random() * 0.012 * H;
      fall.ph[i] = rng.uniform(0, 6.28);
      fall.colR[i] = col[0];
      fall.colG[i] = col[1];
      fall.colB[i] = col[2];
      fall.rad[i] = rng.choice([1.5, 2.0]);
    }

    return { halo, ring, spark, fall };
  }

  // Calculate Stem Control Points
  public getCtrlPoints(
    L: number,
    wilt: number,
    sway: number
  ): [[number, number], [number, number], [number, number], [number, number]] {
    const { cx, y0 } = this;
    const P0: [number, number] = [cx, y0 + 4.0];
    const P1: [number, number] = [
      cx - 0.06 * L * (1 - wilt) + 0.02 * L * wilt,
      y0 - 0.33 * L,
    ];
    const P2: [number, number] = [
      cx + 0.05 * L * (1 - wilt) + 0.08 * L * wilt + sway * 0.5,
      y0 - L * (0.74 + 0.3 * wilt),
    ];
    const P3: [number, number] = [
      cx + sway + 0.32 * L * wilt,
      y0 - L * (1 - 0.15 * wilt),
    ];
    return [P0, P1, P2, P3];
  }

  private addBatch(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    rad: number,
    z: number
  ) {
    if (this.batchCount >= this.maxBatchSize) return;
    const i = this.batchCount++;
    this.batchX[i] = x;
    this.batchY[i] = y;
    this.batchR[i] = r;
    this.batchG[i] = g;
    this.batchB[i] = b;
    this.batchRad[i] = rad;
    this.batchZ[i] = z;
  }

  // -------------------------------------------------------------
  // Main Render Function
  // Evaluates state at time `t` and draws all pointillism layers
  // -------------------------------------------------------------
  public renderToBuffer(t: number): Uint32Array {
    const { H, Lf, theme } = this;
    const st = getState(t);
    const { stem, size, bloom, wilt, leaf, glow } = st;

    // Reset pixel buffer from precomputed base soil
    this.activePixels.set(this.basePixels);
    this.batchCount = 0;

    const L = this.Ls * stem;
    const sway = 0.012 * H * Math.sin(t * 0.9) * stem * (1 - 0.6 * wilt);
    const P = this.getCtrlPoints(L, wilt, sway);
    const [hx, hy] = P[3];

    // 1. Stem Dots
    if (stem > 0.01) {
      const S = this.stem;
      const nv = Math.floor(S.count * clamp(stem, 0.08, 1));
      for (let i = 0; i < nv; i++) {
        const sVal = S.s[i];
        const [bx, by, dx, dy] = bez(P, sVal);
        const nn = Math.hypot(dx, dy) + 1e-6;
        const wst =
          0.0085 *
          H *
          (1 - 0.3 * sVal) *
          (1 - 0.25 * wilt) *
          clamp(0.4 + stem * 1.2, 0.4, 1);
        const lat = S.lat[i] * wst;
        const wi = clamp(wilt * (0.75 + 0.5 * sVal) * (0.7 + 0.5 * S.rn[i]), 0, 1);
        const col = mixcol(
          S.liveR[i], S.liveG[i], S.liveB[i],
          S.wiltR[i], S.wiltG[i], S.wiltB[i],
          wi
        );
        this.addBatch(
          bx - (dy / nn) * lat,
          by + (dx / nn) * lat,
          col[0], col[1], col[2],
          S.rad[i],
          -500.0
        );
      }
    }

    // 2. Leaf Dots
    if (leaf > 0.02 && stem > 0.05) {
      const S = this.leaf;
      const nv = Math.floor(S.count * clamp(leaf, 0.15, 1));

      // Leaf attachment base positions on stem
      const leafBase: [number, number][] = [];
      for (const d of LEAF_DEFS) {
        const [ax, ay] = bez(P, d.s);
        leafBase.push([ax, ay]);
      }

      for (let i = 0; i < nv; i++) {
        const lid = S.lid[i];
        const d = LEAF_DEFS[lid];
        const [ax, ay] = leafBase[lid];

        const a0 = d.a0 + (1 - leaf) * 0.8 - 0.6 * wilt;
        const c = d.c - 0.5 * wilt;
        const u = S.u[i];
        const v = S.v[i];
        const LL = 0.19 * H * d.lfac * leaf * (1 - 0.25 * wilt);
        const am = a0 + c * u * 0.5;
        const al = a0 + c * u;
        const sc = sinc(c * u * 0.5);
        const lat = v * 0.27 * LL * profile(u);

        const X = ax + LL * u * d.dir * Math.cos(am) * sc - lat * Math.sin(al);
        const Yup = LL * u * Math.sin(am) * sc + lat * d.dir * Math.cos(al);
        const wi = clamp(wilt * (0.9 + 0.5 * u + 0.3 * S.rn[i]) - 0.1, 0, 1);
        const col = mixcol(
          S.liveR[i], S.liveG[i], S.liveB[i],
          S.wiltR[i], S.wiltG[i], S.wiltB[i],
          wi
        );
        this.addBatch(X, ay - Yup, col[0], col[1], col[2], S.rad[i], -450.0);
      }
    }

    // 3. Flower Head (Petals, Stamens, Glow Effects, Falling Petals)
    const extraNodes: { x: number; y: number; r: number; g: number; b: number }[] = [];

    if (stem > 0.01 && size > 0.05) {
      const phi = wilt * 2.75 + 0.035 * Math.sin(t * 0.9 + 1.0) * (1 - wilt);
      const tau = 0.2 + 0.36 * bloom - 0.4 * wilt;
      const cphi = Math.cos(phi);
      const sphi = Math.sin(phi);
      const ct = Math.cos(tau);
      const st_ = Math.sin(tau);
      const Ls_ = Lf * size;

      // 3D Projection transform onto 2D canvas
      const project = (
        xl: number,
        yl: number,
        zl: number
      ): [number, number, number, number] => {
        const yp = yl * ct - zl * st_;
        const zp = yl * st_ + zl * ct;
        const X = hx + xl * cphi + yp * sphi;
        const Y = hy - (-xl * sphi + yp * cphi);
        return [X, Y, zp, yp];
      };

      // Petals
      const vis = clamp(size * size * 1.15, 0.2, 1.0);
      const h = this.head;
      const nv = Math.floor(h.count * vis);

      for (let i = 0; i < nv; i++) {
        const u = h.u[i];
        const v = h.v[i];
        let A0 = h.ac[i] + (h.ao[i] - h.ac[i]) * bloom + h.aj[i];
        A0 = A0 * (1 - 0.55 * wilt) + wilt * h.wj[i] * 0.3;
        const K = h.kc[i] + (h.ko[i] - h.kc[i]) * bloom + wilt * (0.6 + 0.6 * h.pj[i]);
        const Lp = Ls_ * h.L[i] * (1 - 0.28 * wilt * h.pj[i]);

        const am = A0 + K * u * 0.5;
        const sc = sinc(K * u * 0.5);
        let rr = Lp * u * Math.sin(am) * sc;
        const hh = Lp * u * Math.cos(am) * sc;
        const lat = v * (h.wc[i] + (h.wo[i] - h.wc[i]) * bloom) * Lp * h.sp[i];
        rr = rr + 0.025 * Ls_ - (0.5 * lat * lat) / (Lp + 1.0);

        const cth = Math.cos(h.th[i]);
        const sth = Math.sin(h.th[i]);
        const [X, Y, zp] = project(cth * rr - sth * lat, hh, sth * rr + cth * lat);

        const zpNorm = clamp((zp / Ls_) * 0.5 + 0.5, 0, 1);
        const shade = clamp(0.72 + 0.28 * zpNorm + 0.12 * (hh / Ls_), 0.5, 1.2);
        const wi = clamp(wilt * (1.0 + 0.7 * u + 0.4 * h.rn[i]) - 0.2, 0, 1);
        const col = mixcol(
          h.liveR[i], h.liveG[i], h.liveB[i],
          h.wiltR[i], h.wiltG[i], h.wiltB[i],
          wi
        );

        this.addBatch(
          X,
          Y,
          col[0] * shade,
          col[1] * shade,
          col[2] * shade,
          h.rad[i],
          zp
        );
      }

      // Stamens
      const ss = smoothstep(bloom, 0.3, 0.85);
      if (ss > 0.02) {
        const S = this.st;
        const nv2 = Math.floor(S.count * clamp(size * size, 0.25, 1));
        for (let i = 0; i < nv2; i++) {
          const ell = Ls_ * ss * S.ell[i];
          const beta = S.beta[i] * (0.6 + 0.4 * bloom) + wilt * 0.3;
          const r = ell * S.t[i] * Math.sin(beta) + 0.02 * Ls_;
          const yl = 0.05 * Ls_ + ell * S.t[i] * Math.cos(beta);
          const [X, Y, zp] = project(
            Math.cos(S.th[i]) * r,
            yl,
            Math.sin(S.th[i]) * r
          );
          const col = mixcol(
            S.liveR[i], S.liveG[i], S.liveB[i],
            S.wiltR[i], S.wiltG[i], S.wiltB[i],
            wilt
          );
          this.addBatch(X, Y, col[0], col[1], col[2], S.rad[i], zp + 3.0);
        }
      }

      // Celestial Aura & Glow FX
      if (glow > 0.02) {
        const axisX = Math.sin(phi);
        const axisY = -Math.cos(phi);
        const ccx = hx + axisX * 0.5 * Ls_;
        const ccy = hy + axisY * 0.5 * Ls_;

        // Halo
        const Hh = this.halo;
        const nh = Math.floor(Hh.count * glow);
        for (let i = 0; i < nh; i++) {
          const rh = Hh.r[i] * Ls_ * 1.1;
          const br =
            Hh.b[i] * glow * (0.85 + 0.3 * Math.sin(t * 1.3 + Hh.fl[i] * 6.28));
          this.addBatch(
            ccx + Math.cos(Hh.a[i]) * rh,
            ccy + Math.sin(Hh.a[i]) * rh,
            theme.haloCol[0] * br,
            theme.haloCol[1] * br,
            theme.haloCol[2] * br,
            1.0,
            -2000.0
          );
        }

        // Orbital Ring
        const R = this.ring;
        const nr = Math.floor(R.count * glow);
        const Rs = Ls_ * 1.25;
        for (let i = 0; i < nr; i++) {
          const cang = (2 * Math.PI * R.cj[i]) / 6 + t * 0.15;
          const a = R.a[i] + t * 0.05;
          const rx = ccx + Rs * (R.cf[i] * Math.cos(cang) + R.rho[i] * Math.cos(a));
          const ry = ccy + Rs * (R.cf[i] * Math.sin(cang) + R.rho[i] * Math.sin(a));
          const bb =
            (0.4 + 0.6 * glow) * (0.65 + 0.35 * Math.sin(t * 2 + R.fl[i] * 20));
          this.addBatch(
            rx,
            ry,
            theme.ringCol[0] * bb,
            theme.ringCol[1] * bb,
            theme.ringCol[2] * bb,
            1.0,
            -1500.0
          );
        }

        // 6 Star Nodes
        for (let i = 0; i < 6; i++) {
          const ja = (2 * Math.PI * i) / 6 + t * 0.15;
          extraNodes.push({
            x: ccx + Rs * Math.cos(ja),
            y: ccy + Rs * Math.sin(ja),
            r: 255 * glow,
            g: 215 * glow,
            b: 255 * glow,
          });
        }

        // Sparks / Stardust
        const Sp = this.spark;
        for (let i = 0; i < Sp.count; i++) {
          const life = (t * 0.1 * Sp.sp[i] + Sp.ph[i]) % 1.0;
          const rho = (0.25 + 1.15 * Sp.rho[i]) * Ls_ * (0.6 + 0.6 * life);
          const px = ccx + Math.cos(Sp.a[i]) * rho;
          const py = ccy + Math.sin(Sp.a[i]) * rho - life * 0.25 * Ls_;
          const bs = Math.pow(Math.sin(Math.PI * life), 0.8) * glow;
          const cs = Sp.hue[i] < 0.5 ? theme.sparkA : theme.sparkB;
          this.addBatch(
            px,
            py,
            cs[0] * bs,
            cs[1] * bs,
            cs[2] * bs,
            Sp.rad[i],
            2000.0
          );
        }
      }

      // Falling Petals during Wilting
      if (wilt > 0.02) {
        const F = this.fall;
        for (let i = 0; i < F.count; i++) {
          const fp = clamp((wilt * 1.05 - F.r0[i] * 0.7) / 0.35, 0, 1);
          if (fp > 0) {
            const sx = hx + F.ox[i] * 0.18 * Ls_;
            const sy = hy + F.oy[i] * 0.18 * Ls_ + 0.25 * Ls_;
            const x =
              sx +
              (F.xl[i] - sx) * fp +
              Math.sin(fp * 6.28 + F.ph[i]) * 0.03 * H * (1 - fp);
            const y = sy + (F.yl[i] - sy) * fp * fp;
            this.addBatch(x, y, F.colR[i], F.colG[i], F.colB[i], F.rad[i], 500.0);
          }
        }
      }
    }

    // Sort batch by depth Z (ascending, far to near)
    const count = this.batchCount;
    for (let i = 0; i < count; i++) {
      this.batchIndices[i] = i;
    }
    const bZ = this.batchZ;
    // Fast in-place index sort by Z
    const indicesSlice = this.batchIndices.subarray(0, count);
    indicesSlice.sort((a, b) => bZ[a] - bZ[b]);

    // Draw sorted dots to active buffer
    for (let k = 0; k < count; k++) {
      const idx = indicesSlice[k];
      this.splatOnBuffer(
        this.activePixels,
        this.batchX[idx],
        this.batchY[idx],
        this.batchR[idx],
        this.batchG[idx],
        this.batchB[idx],
        this.batchRad[idx],
        13
      );
    }

    // Draw extra star nodes on top
    for (const node of extraNodes) {
      this.splatOnBuffer(
        this.activePixels,
        node.x,
        node.y,
        node.r,
        node.g,
        node.b,
        3.0,
        29
      );
    }

    // Animated Soil Crumb Particles
    const C = this.cr;
    for (let i = 0; i < C.count; i++) {
      const e = clamp((t - C.delay[i]) / 3.0, 0, 1);
      const sy = C.y[i] - C.amp[i] * Math.sin(Math.PI * e);
      this.splatOnBuffer(
        this.activePixels,
        C.x[i],
        sy,
        C.colR[i],
        C.colG[i],
        C.colB[i],
        C.rad[i],
        13
      );
    }

    return this.activePixels;
  }
}
