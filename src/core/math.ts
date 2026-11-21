// 基础数学工具,单位约定:长度 mm,屈光度 D,角度 deg

export const DEG = Math.PI / 180;

// 角膜折射率换算常数 (角膜曲率半径 mm -> 屈光度 D)
export const K_INDEX = 337.5;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// 球面矢高 (sagitta): R 曲率半径 mm, r 径向距离 mm
export const sphereSag = (R: number, r: number): number => {
  const q = R * R - r * r;
  return q <= 0 ? R : R - Math.sqrt(q);
};

// 圆锥曲面矢高: c = 1/R, Q 非球面系数 (Q = -e^2)
export const conicSag = (c: number, Q: number, r: number): number => {
  const inner = 1 - (1 + Q) * c * c * r * r;
  if (inner <= 0) return NaN;
  return (c * r * r) / (1 + Math.sqrt(inner));
};

// 旋转二维坐标 (deg)
export const rot2 = (x: number, y: number, deg: number): [number, number] => {
  const a = deg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

// 可复现伪随机 (mulberry32)
export const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// 二维规则网格
export interface Grid {
  n: number;       // 每边采样数
  half: number;    // 半宽 mm, 覆盖 [-half, half]
  step: number;    // 网格间距 mm
}

export const makeGrid = (n: number, half: number): Grid => ({
  n, half, step: (2 * half) / (n - 1),
});

// 网格坐标 -> 物理坐标
export const gridXY = (g: Grid, i: number, j: number): [number, number] => [
  -g.half + j * g.step,
  -g.half + i * g.step,
];

// 物理坐标 -> 双线性采样 (越界返回 NaN)
export const sampleBilinear = (g: Grid, data: Float32Array, x: number, y: number): number => {
  const fx = (x + g.half) / g.step;
  const fy = (y + g.half) / g.step;
  if (fx < 0 || fy < 0 || fx > g.n - 1 || fy > g.n - 1) return NaN;
  const x0 = Math.min(Math.floor(fx), g.n - 2);
  const y0 = Math.min(Math.floor(fy), g.n - 2);
  const tx = fx - x0, ty = fy - y0;
  const i00 = y0 * g.n + x0;
  const v00 = data[i00], v10 = data[i00 + 1];
  const v01 = data[i00 + g.n], v11 = data[i00 + g.n + 1];
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
};
