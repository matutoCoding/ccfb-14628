// 角膜模型: 双锥曲面 (biconic), 支持散光轴向旋转与顶点偏心
// z(x,y) = (cx*x'^2 + cy*y'^2) / (1 + sqrt(1 - (1+Qx)*cx^2*x'^2 - (1+Qy)*cy^2*y'^2))
// (x',y') 为平移顶点偏心再旋转到主子午线后的坐标

import { DEG, K_INDEX, gridXY, rot2, rng } from "./math.ts";
import type { Grid } from "./math.ts";

export interface CorneaParams {
  rx: number;      // 水平主子午线曲率半径 mm (旋转前)
  ry: number;      // 垂直主子午线曲率半径 mm
  qx: number;      // 水平非球面系数 Q
  qy: number;
  axis: number;    // 平子午线轴向 deg (顺规散光约 180, 即平轴在水平)
  dx: number;      // 顶点偏心 mm (相对角膜几何中心, +x 颞侧)
  dy: number;      // +y 上方
  diameter: number;// 可见角膜直径 mm
}

// 双锥曲面高度 (mm, 顶点切平面为 0, 向眼内为正)
export const corneaZ = (p: CorneaParams, x: number, y: number): number => {
  const [xr, yr] = rot2(x - p.dx, y - p.dy, -p.axis);
  const cx = 1 / p.rx, cy = 1 / p.ry;
  const xx = cx * xr * xr, yy = cy * yr * yr;
  const inner = 1 - (1 + p.qx) * cx * xx - (1 + p.qy) * cy * yy;
  if (inner <= 0.02) return NaN;
  return (xx + yy) / (1 + Math.sqrt(inner));
};

// 高度图
export const elevationMap = (p: CorneaParams, g: Grid): Float32Array => {
  const out = new Float32Array(g.n * g.n);
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const [x, y] = gridXY(g, i, j);
      out[i * g.n + j] = corneaZ(p, x, y);
    }
  return out;
};

// 轴向曲率图 (D): R_axial = r / sin(atan(dz/dr))
export const axialMap = (p: CorneaParams, g: Grid): Float32Array => {
  const out = new Float32Array(g.n * g.n);
  const h = 0.01; // 数值微分步长 mm
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const [x, y] = gridXY(g, i, j);
      const r = Math.hypot(x, y);
      if (r < 0.05) {
        // 顶点处用局部平均曲率
        const k = 0.5 * (K_INDEX / p.rx + K_INDEX / p.ry);
        out[i * g.n + j] = k;
        continue;
      }
      const ux = x / r, uy = y / r;
      const z1 = corneaZ(p, x - ux * h, y - uy * h);
      const z2 = corneaZ(p, x + ux * h, y + uy * h);
      const dzdr = (z2 - z1) / (2 * h);
      if (!isFinite(dzdr) || Math.abs(dzdr) < 1e-6) {
        out[i * g.n + j] = NaN;
        continue;
      }
      // 轴向半径: 表面点沿法线到光轴的距离
      const rAx = r * Math.sqrt(1 + dzdr * dzdr) / Math.abs(dzdr);
      out[i * g.n + j] = K_INDEX / rAx;
    }
  return out;
};

// 切向曲率图 (D): K = z'' / (1 + z'^2)^1.5 沿径向
export const tangentialMap = (p: CorneaParams, g: Grid): Float32Array => {
  const out = new Float32Array(g.n * g.n);
  const h = 0.02;
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const [x, y] = gridXY(g, i, j);
      const r = Math.hypot(x, y);
      const ux = r > 1e-6 ? x / r : 1, uy = r > 1e-6 ? y / r : 0;
      const z0 = corneaZ(p, x, y);
      const z1 = corneaZ(p, x - ux * h, y - uy * h);
      const z2 = corneaZ(p, x + ux * h, y + uy * h);
      if (!isFinite(z0) || !isFinite(z1) || !isFinite(z2)) {
        out[i * g.n + j] = NaN;
        continue;
      }
      const dz = (z2 - z1) / (2 * h);
      const dzz = (z2 - 2 * z0 + z1) / (h * h);
      const k = Math.abs(dzz) / Math.pow(1 + dz * dz, 1.5); // 1/mm
      out[i * g.n + j] = K_INDEX * k;
    }
  return out;
};

// 最佳拟合球面 (在给定孔径内最小二乘拟合 R)
export const bestFitSphere = (p: CorneaParams, aperture: number): number => {
  let num = 0, den = 0;
  const N = 64;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = -aperture + (2 * aperture * j) / (N - 1);
      const y = -aperture + (2 * aperture * i) / (N - 1);
      const r = Math.hypot(x, y);
      if (r > aperture || r < 1e-6) continue;
      const z = corneaZ(p, x, y);
      if (!isFinite(z)) continue;
      // z ≈ r^2 / (2R) 最小二乘
      num += z * r * r;
      den += r * r * r * r;
    }
  return den > 0 ? (2 * num) / den : p.rx;
};

// 高度差图 (相对最佳拟合球面, 返回 mm)
export const elevationDiffMap = (p: CorneaParams, g: Grid, Rbfs: number): Float32Array => {
  const out = new Float32Array(g.n * g.n);
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const [x, y] = gridXY(g, i, j);
      const z = corneaZ(p, x, y);
      const q = Rbfs * Rbfs - (x * x + y * y);
      const zb = q > 0 ? Rbfs - Math.sqrt(q) : NaN;
      out[i * g.n + j] = isFinite(z) && isFinite(zb) ? z - zb : NaN;
    }
  return out;
};

// 模拟角膜生成器: 覆盖对称 / 顺规大散光 / 逆规 / 斜轴 / 顶点偏心
export type CorneaKind = "symmetric" | "wtr_astig" | "atr_astig" | "oblique_astig" | "decentered";

export const CORNEA_KIND_LABEL: Record<CorneaKind, string> = {
  symmetric: "规则对称",
  wtr_astig: "顺规大散光",
  atr_astig: "逆规散光",
  oblique_astig: "斜轴散光",
  decentered: "顶点偏心",
};

export const generateCornea = (kind: CorneaKind, seed: number): CorneaParams => {
  const rand = rng(seed);
  const kFlat = 42.5 + rand() * 2.5; // 平K 42.5~45 D
  const rf = K_INDEX / kFlat;
  const base: CorneaParams = {
    rx: rf, ry: rf, qx: -0.26, qy: -0.26,
    axis: 0, dx: 0, dy: 0, diameter: 11.5,
  };
  switch (kind) {
    case "symmetric":
      base.ry = rf - 0.03 - rand() * 0.05; // 生理性微散光
      break;
    case "wtr_astig": {
      const dk = 1.8 + rand() * 1.4; // 散光 1.8~3.2 D
      base.ry = K_INDEX / (kFlat + dk); // 垂直子午线更陡
      base.axis = (rand() - 0.5) * 12;
      break;
    }
    case "atr_astig": {
      const dk = 1.2 + rand() * 1.0;
      base.ry = K_INDEX / (kFlat + dk);
      base.axis = 90 + (rand() - 0.5) * 10;
      break;
    }
    case "oblique_astig": {
      const dk = 1.5 + rand() * 1.2;
      base.ry = K_INDEX / (kFlat + dk);
      base.axis = 35 + rand() * 30;
      break;
    }
    case "decentered": {
      const dk = 0.8 + rand() * 1.2;
      base.ry = K_INDEX / (kFlat + dk);
      base.axis = (rand() - 0.5) * 20;
      base.dx = 0.35 + rand() * 0.35; // 顶点偏心 0.35~0.7 mm
      base.dy = -(0.15 + rand() * 0.3);
      break;
    }
  }
  return base;
};

// 角膜平/陡K (D) 与散光
export const corneaK = (p: CorneaParams): { kf: number; ks: number; cyl: number } => {
  const k1 = K_INDEX / p.rx, k2 = K_INDEX / p.ry;
  const kf = Math.min(k1, k2), ks = Math.max(k1, k2);
  return { kf, ks, cyl: ks - kf };
};
