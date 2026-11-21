// 镜片模型: 反几何四弧/五弧设计
// 弧段自中心向外: BC 基弧 -> RC 反转弧 -> AC1 定位弧 -> [AC2 第二定位弧] -> PC 周边弧
// 每段为球面, 段间保持表面连续 (沿轴平移球心), 背面矢深逐段递推

import { K_INDEX, sphereSag } from "./math.ts";
import type { CorneaParams } from "./cornea.ts";
import { corneaK, corneaZ } from "./cornea.ts";

export interface LensDesign {
  name: string;
  targetReduction: number; // 目标降度 D (正数, 如 3.0 表示矫正 -3.00D)
  compression: number;     // 压缩系数 D (Jessen 因子, 常用 0.50~0.75)
  bcRadius: number;        // 基弧半径 mm (由降度自动重算, 可手动覆盖)
  bcAuto: boolean;         // 是否自动重算基弧
  ozd: number;             // 光学区直径 mm (基弧区)
  rcRadius: number;        // 反转弧半径 mm
  rcAuto: boolean;         // 是否按顶点间隙目标自动求解反转弧
  apicalTarget: number;    // 目标顶点间隙 um
  rcWidth: number;         // 反转弧宽度 mm
  acRadius: number;        // 定位弧半径 mm (平子午线)
  acWidth: number;         // 定位弧宽度 mm
  acToric: boolean;        // 环曲定位弧
  acToricDelta: number;    // 环曲量: 陡子午线半径减小量 mm
  useAC2: boolean;         // 五弧: 第二定位弧
  ac2Radius: number;
  ac2Width: number;
  pcRadius: number;        // 周边弧半径 mm
  pcWidth: number;         // 周边弧宽度 mm
  diameter: number;        // 镜片总直径 mm
}

// 由目标降度重算基弧: BC(D) = 平K - 降度 - 压缩系数 (近视矫正需压平, 基弧比平K更平)
export const autoBcRadius = (cornea: CorneaParams, target: number, compression: number): number => {
  const { kf } = corneaK(cornea);
  return K_INDEX / (kf - target - compression);
};

// 弧段边界半径 (自中心累计, mm)
export interface ZoneBounds {
  rBC: number;   // 基弧区外缘
  rRC: number;   // 反转弧外缘
  rAC1: number;  // 定位弧外缘
  rAC2: number;  // 第二定位弧外缘 (未启用时等于 rAC1)
  rPC: number;   // 周边弧外缘 = 镜片半径
}

export const zoneBounds = (L: LensDesign): ZoneBounds => {
  const rBC = L.ozd / 2;
  const rRC = rBC + L.rcWidth;
  const rAC1 = rRC + L.acWidth;
  const rAC2 = L.useAC2 ? rAC1 + L.ac2Width : rAC1;
  const rPC = rAC2 + L.pcWidth;
  return { rBC, rRC, rAC1, rAC2, rPC };
};

// 子午线相关的定位弧半径 (环曲时陡子午线更陡)
// theta: 相对角膜平子午线轴向的角度 rad
export const acRadiusAt = (L: LensDesign, theta: number): number => {
  if (!L.acToric) return L.acRadius;
  const s = Math.sin(theta);
  return L.acRadius - L.acToricDelta * s * s;
};

// 镜片背面矢深 (mm, 顶点切平面为 0, 向眼内为正)
// theta 用于环曲定位弧; 非环曲时与角度无关
export const lensSag = (L: LensDesign, r: number, theta: number): number => {
  const b = zoneBounds(L);
  if (r < 0) r = -r;
  // 各段球面矢高 + 连续偏移, 逐段递推
  let s = sphereSag(L.bcRadius, r);
  if (r <= b.rBC) return s;
  let off = sphereSag(L.bcRadius, b.rBC) - sphereSag(L.rcRadius, b.rBC);
  s = sphereSag(L.rcRadius, r) + off;
  if (r <= b.rRC) return s;
  const rAC = acRadiusAt(L, theta);
  off += sphereSag(L.rcRadius, b.rRC) - sphereSag(rAC, b.rRC);
  s = sphereSag(rAC, r) + off;
  if (r <= b.rAC1) return s;
  if (L.useAC2) {
    off += sphereSag(rAC, b.rAC1) - sphereSag(L.ac2Radius, b.rAC1);
    s = sphereSag(L.ac2Radius, r) + off;
    if (r <= b.rAC2) return s;
    off += sphereSag(L.ac2Radius, b.rAC2) - sphereSag(L.pcRadius, b.rAC2);
    s = sphereSag(L.pcRadius, r) + off;
    return s;
  }
  off += sphereSag(rAC, b.rAC1) - sphereSag(L.pcRadius, b.rAC1);
  s = sphereSag(L.pcRadius, r) + off;
  return s;
};

// 镜片总矢深 (边缘处)
export const lensTotalSag = (L: LensDesign, theta: number): number =>
  lensSag(L, L.diameter / 2, theta);

// 按目标顶点间隙自动求解反转弧半径
// 顶点间隙 g = max(zl - zc) 于镜片全区, 对 R_rc 单调, 二分求解
export const solveRcRadius = (L: LensDesign, cornea: CorneaParams): number => {
  const rMax = L.diameter / 2;
  const gFor = (Rrc: number): number => {
    const probe: LensDesign = { ...L, rcRadius: Rrc };
    let m = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const r = (rMax * i) / 100;
      for (let j = 0; j < 36; j++) {
        const a = (2 * Math.PI * j) / 36;
        const zc = corneaZ(cornea, r * Math.cos(a), r * Math.sin(a));
        if (!isFinite(zc)) continue;
        const theta = a - cornea.axis * (Math.PI / 180);
        const d = lensSag(probe, r, theta) - zc;
        if (d > m) m = d;
      }
    }
    return m;
  };
  const target = L.apicalTarget / 1000;
  let lo = L.bcRadius * 0.5, hi = L.bcRadius * 2.0;
  // R_rc 越小(越陡) g 越大
  if (gFor(hi) > target) return hi; // 其他弧段主导, 反转弧已无能为力
  if (gFor(lo) < target) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (gFor(mid) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

// 默认设计: 按角膜平K与目标降度生成一套合理初值
export const defaultLens = (cornea: CorneaParams, target: number): LensDesign => {
  const { kf, cyl } = corneaK(cornea);
  const compression = 0.75;
  const bc = K_INDEX / (kf - target - compression);
  const rf = K_INDEX / kf;
  const needToric = cyl > 1.5;
  const L: LensDesign = {
    name: "OK-4弧",
    targetReduction: target,
    compression,
    bcRadius: bc,
    bcAuto: true,
    ozd: 6.0,
    rcRadius: bc * 0.8,
    rcAuto: true,
    apicalTarget: 15,
    rcWidth: 0.7,
    acRadius: rf + 0.05,
    acWidth: 1.1,
    acToric: needToric,
    acToricDelta: needToric ? Math.min(cyl * 0.09, 0.35) : 0,
    useAC2: false,
    ac2Radius: rf + 0.3,
    ac2Width: 0.5,
    pcRadius: 11.5,
    pcWidth: 0.5,
    diameter: 10.6,
  };
  L.rcRadius = solveRcRadius(L, cornea);
  return L;
};
