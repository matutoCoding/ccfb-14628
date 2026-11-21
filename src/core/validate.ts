// 几何验证: 泪膜厚度关键点与手算矢高公式对照
// 手算路径为独立书写的公式实现 (不调用引擎函数), 模拟验配师手算过程:
//   角膜: 双锥曲面矢高公式
//   镜片: 分段球面矢高 R - sqrt(R^2 - r^2), 段间连续性偏移
//   静止位: 稠密扫描 max(zl - zc)

import { generateCornea } from "./cornea.ts";
import type { CorneaParams } from "./cornea.ts";
import { defaultLens, zoneBounds } from "./lens.ts";
import type { LensDesign } from "./lens.ts";
import { solvePose, tearAt, keyPoints } from "./tear_fit.ts";

export interface CheckRow {
  name: string;
  engine: number;   // 配适引擎值 um
  hand: number;     // 手算公式值 um
  error: number;    // 误差 um
  pass: boolean;    // < 2 um
}

// ---- 独立手算实现 (与引擎源码分离) ----

const DEG = Math.PI / 180;

// 手算角膜矢高: 双锥曲面公式
const handCorneaZ = (p: CorneaParams, x: number, y: number): number => {
  const a = -p.axis * DEG;
  const xr = (x - p.dx) * Math.cos(a) - (y - p.dy) * Math.sin(a);
  const yr = (x - p.dx) * Math.sin(a) + (y - p.dy) * Math.cos(a);
  const cx = 1 / p.rx, cy = 1 / p.ry;
  const qx = cx * xr * xr, qy = cy * yr * yr;
  const inner = 1 - (1 + p.qx) * cx * qx - (1 + p.qy) * cy * qy;
  if (inner <= 0.02) return NaN;
  return (qx + qy) / (1 + Math.sqrt(inner));
};

// 手算球面矢高: 教科书公式
const handSag = (R: number, r: number): number => R - Math.sqrt(R * R - r * r);

// 手算镜片背面矢深: 逐段递推连续偏移
const handLensSag = (L: LensDesign, r: number, theta: number): number => {
  const b = zoneBounds(L);
  const acR = L.acToric
    ? L.acRadius - L.acToricDelta * Math.sin(theta) * Math.sin(theta)
    : L.acRadius;
  let s = handSag(L.bcRadius, r);
  if (r <= b.rBC) return s;
  let off = handSag(L.bcRadius, b.rBC) - handSag(L.rcRadius, b.rBC);
  s = handSag(L.rcRadius, r) + off;
  if (r <= b.rRC) return s;
  off += handSag(L.rcRadius, b.rRC) - handSag(acR, b.rRC);
  s = handSag(acR, r) + off;
  if (r <= b.rAC1) return s;
  if (L.useAC2) {
    off += handSag(acR, b.rAC1) - handSag(L.ac2Radius, b.rAC1);
    s = handSag(L.ac2Radius, r) + off;
    if (r <= b.rAC2) return s;
    off += handSag(L.ac2Radius, b.rAC2) - handSag(L.pcRadius, b.rAC2);
    return handSag(L.pcRadius, r) + off;
  }
  off += handSag(acR, b.rAC1) - handSag(L.pcRadius, b.rAC1);
  return handSag(L.pcRadius, r) + off;
};

// 手算静止位: 稠密扫描 (1000 x 360) max(zl - zc)
const handSolveG = (c: CorneaParams, L: LensDesign): number => {
  let m = -Infinity;
  const rMax = L.diameter / 2;
  for (let i = 0; i <= 1000; i++) {
    const r = (rMax * i) / 1000;
    for (let j = 0; j < 360; j++) {
      const a = (2 * Math.PI * j) / 360;
      const zc = handCorneaZ(c, r * Math.cos(a), r * Math.sin(a));
      if (!isFinite(zc)) continue;
      const theta = a - c.axis * DEG;
      const d = handLensSag(L, r, theta) - zc;
      if (d > m) m = d;
    }
  }
  return m;
};

// ---- 对照 ----

export const runValidation = (): CheckRow[] => {
  const rows: CheckRow[] = [];
  const corneas: [string, CorneaParams][] = [
    ["对称角膜", generateCornea("symmetric", 7)],
    ["顺规大散光", generateCornea("wtr_astig", 8)],
    ["顶点偏心", generateCornea("decentered", 9)],
  ];
  for (const [label, c] of corneas) {
    const L: LensDesign = defaultLens(c, 3.0);
    const pose = solvePose(c, L);
    const gHand = handSolveG(c, L);
    const b = zoneBounds(L);
    const kp = keyPoints(c, L, pose);
    // 静止位顶点间隙: 引擎扫描 vs 手算稠密扫描
    rows.push(mkRow(`${label} 顶点间隙`, kp.apical, gHand * 1000));
    // 关键点泪膜厚度: 同一 g 下, 引擎 tearAt vs 手算公式链
    const pts: [string, number][] = [
      [`${label} 基弧边缘`, b.rBC],
      [`${label} 反转弧中点`, (b.rBC + b.rRC) / 2],
      [`${label} 定位弧中点`, (b.rRC + b.rAC1) / 2],
      [`${label} 镜片边缘`, L.diameter / 2],
    ];
    for (const [name, r] of pts) {
      const engine = tearAt(c, L, pose, r, 0) * 1000;
      const hand = (handCorneaZ(c, r, 0) - handLensSag(L, r, -c.axis * DEG) + pose.g) * 1000;
      rows.push(mkRow(name, engine, hand));
    }
  }
  return rows;
};

const mkRow = (name: string, engine: number, hand: number): CheckRow => {
  const error = Math.abs(engine - hand);
  return { name, engine, hand, error, pass: error < 2 };
};
