// 配适计算: 矢高平衡定位 + 泪膜厚度逐点计算
// 坐标约定: 矢深向眼内为正. 角膜矢深 zc, 镜片背面矢深 zl, 顶点间隙 g (mm)
// 泪膜厚度 T(x,y) = zc(x,y) - zl(x-lx, y-ly) + g

import { gridXY, DEG } from "./math.ts";
import type { Grid } from "./math.ts";
import { corneaZ } from "./cornea.ts";
import type { CorneaParams } from "./cornea.ts";
import { lensSag, zoneBounds } from "./lens.ts";
import type { LensDesign } from "./lens.ts";

export interface LensPose {
  g: number;   // 顶点间隙 mm (矢高平衡求得)
  lx: number;  // 水平偏位 mm (+ 颞侧)
  ly: number;  // 垂直偏位 mm (+ 上方, 眨眼时下压为负)
}

// 单点泪膜厚度 (mm)
export const tearAt = (
  c: CorneaParams, L: LensDesign, pose: LensPose, x: number, y: number,
): number => {
  const zc = corneaZ(c, x, y);
  const rx = x - pose.lx, ry = y - pose.ly;
  const r = Math.hypot(rx, ry);
  if (r > L.diameter / 2) return NaN; // 镜片覆盖范围外
  // 环曲定位弧相对角膜平轴取向
  const theta = Math.atan2(ry, rx) - c.axis * DEG;
  const zl = lensSag(L, r, theta);
  return zc - zl + pose.g;
};

// 矢高平衡: 镜片沿轴下沉至首次接触, g = max(zl - zc) 于镜片覆盖区内
// 采样径向 x 周向网格求最大值
export const solvePose = (c: CorneaParams, L: LensDesign, lx = 0, ly = 0): LensPose => {
  let m = -Infinity;
  const NR = 200, NT = 144;
  const rMax = L.diameter / 2;
  for (let i = 0; i <= NR; i++) {
    const r = (rMax * i) / NR;
    for (let j = 0; j < NT; j++) {
      const a = (2 * Math.PI * j) / NT;
      const x = lx + r * Math.cos(a), y = ly + r * Math.sin(a);
      const zc = corneaZ(c, x, y);
      if (!isFinite(zc)) continue;
      const theta = a - c.axis * DEG;
      const zl = lensSag(L, r, theta);
      const d = zl - zc;
      if (d > m) m = d;
    }
  }
  return { g: isFinite(m) ? m : 0, lx, ly };
};

// 泪膜厚度图 (mm), 镜片外为 NaN
export const tearMap = (
  c: CorneaParams, L: LensDesign, pose: LensPose, g: Grid,
): Float32Array => {
  const out = new Float32Array(g.n * g.n);
  for (let i = 0; i < g.n; i++)
    for (let j = 0; j < g.n; j++) {
      const [x, y] = gridXY(g, i, j);
      out[i * g.n + j] = tearAt(c, L, pose, x, y);
    }
  return out;
};

// 关键点泪膜厚度 (um), 用于与手算矢高公式对照
export interface KeyPoints {
  apical: number;      // 中央顶点间隙
  bcEdge: number;      // 基弧/反转弧交界
  rcPool: number;      // 反转弧池最深点
  acTouch: number;     // 定位弧接触区最小值
  edgeLift: number;    // 边翘 (镜片边缘处)
  touchRadius: number; // 接触点半径 mm
}

export const keyPoints = (c: CorneaParams, L: LensDesign, pose: LensPose): KeyPoints => {
  const b = zoneBounds(L);
  const um = 1000;
  // 沿多条子午线扫描
  const NT = 36;
  let rcPool = 0, acTouch = Infinity, touchR = 0, edge = 0;
  for (let j = 0; j < NT; j++) {
    const a = (2 * Math.PI * j) / NT;
    // 反转弧池: 扫描反转弧区间
    for (let k = 0; k <= 40; k++) {
      const r = b.rBC + ((b.rRC - b.rBC) * k) / 40;
      const t = tearAt(c, L, pose, r * Math.cos(a), r * Math.sin(a));
      if (isFinite(t) && t > rcPool) rcPool = t;
    }
    // 定位弧接触: 扫描定位弧区间
    for (let k = 0; k <= 40; k++) {
      const r = b.rRC + ((b.rAC1 - b.rRC) * k) / 40;
      const t = tearAt(c, L, pose, r * Math.cos(a), r * Math.sin(a));
      if (isFinite(t) && t < acTouch) { acTouch = t; touchR = r; }
    }
    const te = tearAt(c, L, pose, (L.diameter / 2) * Math.cos(a), (L.diameter / 2) * Math.sin(a));
    if (isFinite(te)) edge = Math.max(edge, te);
  }
  return {
    apical: pose.g * um,
    bcEdge: tearAt(c, L, pose, b.rBC, 0) * um,
    rcPool: rcPool * um,
    acTouch: acTouch * um,
    edgeLift: edge * um,
    touchRadius: touchR,
  };
};

// 眨眼动力学: 上睑下压, 镜片先下移再指数回弹居中
// t: 眨眼后时间 s; 返回垂直偏位 mm (负 = 向下)
export const blinkOffset = (t: number, amplitude: number, tau: number): number => {
  if (t < 0) return 0;
  // 过阻尼回弹带一点超调: -A * (e^(-t/tau) 主项 + 小振荡)
  const main = Math.exp(-t / tau);
  const osc = 0.18 * Math.exp(-t / (tau * 0.6)) * Math.sin((2 * Math.PI * t) / (tau * 1.6));
  return -amplitude * (main + osc);
};
