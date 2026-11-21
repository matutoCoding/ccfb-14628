// 塑形效果预测: 中央压平 + 差异地形图 + 牛眼图偏心量
// 模型: z_post = z_pre - A * exp(-(r'/sigma)^2), r' 相对治疗区中心
// 中央曲率变化 ΔK = 675 * A / sigma^2 (D, A/sigma 单位 mm)

import { gridXY, K_INDEX } from "./math.ts";
import type { Grid } from "./math.ts";
import { corneaZ } from "./cornea.ts";
import type { CorneaParams } from "./cornea.ts";

export interface TreatmentParams {
  targetReduction: number; // 目标降度 D
  tzRadius: number;        // 治疗区半径 mm (约等于反转弧内缘半径)
  cx: number;              // 治疗区中心偏位 mm
  cy: number;
}

// 压平深度 A (mm)
export const flattenDepth = (t: TreatmentParams): number =>
  (t.targetReduction * t.tzRadius * t.tzRadius) / (2 * K_INDEX);

// 塑形后角膜高度
export const treatedZ = (c: CorneaParams, t: TreatmentParams, x: number, y: number): number => {
  const z = corneaZ(c, x, y);
  if (!isFinite(z)) return NaN;
  const A = flattenDepth(t);
  const rr = Math.hypot(x - t.cx, y - t.cy) / t.tzRadius;
  return z - A * Math.exp(-rr * rr);
};

// 差异图 (mm): 塑形前 - 塑形后 (正值 = 变平/组织位移量)
export const treatmentDiffMap = (
  c: CorneaParams, t: TreatmentParams, g: Grid,
): Float32Array => {
  const out = new Float32Array(g.n * g.n);
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const [x, y] = gridXY(g, i, j);
      const z0 = corneaZ(c, x, y);
      const z1 = treatedZ(c, t, x, y);
      out[i * g.n + j] = isFinite(z0) && isFinite(z1) ? z0 - z1 : NaN;
    }
  return out;
};

// 牛眼图分析: 从差异图提取治疗区质心偏心量与直径
export interface Bullseye {
  decenterX: number;   // mm
  decenterY: number;
  decenterMag: number; // 偏心量 mm
  tzDiameter: number;  // 治疗区直径 mm (50% 峰值等值线平均直径)
}

export const analyzeBullseye = (diff: Float32Array, g: Grid): Bullseye => {
  let max = 0;
  for (let k = 0; k < diff.length; k++) if (diff[k] > max) max = diff[k];
  if (max <= 0) return { decenterX: 0, decenterY: 0, decenterMag: 0, tzDiameter: 0 };
  const thr = 0.5 * max;
  let sx = 0, sy = 0, sw = 0, count = 0;
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const v = diff[i * g.n + j];
      if (!isFinite(v) || v < thr) continue;
      const [x, y] = gridXY(g, i, j);
      sx += x * v; sy += y * v; sw += v; count++;
    }
  const cx = sw > 0 ? sx / sw : 0;
  const cy = sw > 0 ? sy / sw : 0;
  // 等效直径: 面积 -> 圆
  const area = count * g.step * g.step;
  return {
    decenterX: cx,
    decenterY: cy,
    decenterMag: Math.hypot(cx, cy),
    tzDiameter: 2 * Math.sqrt(area / Math.PI),
  };
};
