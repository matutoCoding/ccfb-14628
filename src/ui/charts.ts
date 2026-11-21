// Canvas 2D 绘图: 趋势线图 + 镜片/角膜截面图

import { corneaZ } from "../core/cornea.ts";
import type { CorneaParams } from "../core/cornea.ts";
import { lensSag } from "../core/lens.ts";
import type { LensDesign } from "../core/lens.ts";
import type { LensPose } from "../core/tear_fit.ts";

export interface TrendSeries {
  label: string;
  color: string;
  points: { x: string; y: number }[]; // x 为日期标签
}

// 多序列折线图 (复查趋势)
export const drawTrend = (
  canvas: HTMLCanvasElement, series: TrendSeries[], yLabel: string, alertY?: number,
): void => {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const padL = 44, padR = 12, padT = 16, padB = 28;
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  if (all.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui";
    ctx.fillText("暂无复查数据", padL, H / 2);
    return;
  }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (alertY !== undefined) { lo = Math.min(lo, alertY); hi = Math.max(hi, alertY); }
  const span = hi - lo || 1;
  lo -= span * 0.15; hi += span * 0.15;
  const labels = series[0].points.map((p) => p.x);
  const X = (i: number) => padL + ((W - padL - padR) * i) / Math.max(labels.length - 1, 1);
  const Y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  // 网格与坐标
  ctx.strokeStyle = "#e2e8f0";
  ctx.fillStyle = "#64748b";
  ctx.font = "12px system-ui";
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v));
    ctx.stroke();
    ctx.fillText(v.toFixed(2), 4, Y(v) + 4);
  }
  labels.forEach((s, i) => ctx.fillText(s.slice(5), X(i) - 14, H - 8));
  ctx.fillText(yLabel, 4, 12);
  // 告警线
  if (alertY !== undefined) {
    ctx.strokeStyle = "#dc2626";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, Y(alertY)); ctx.lineTo(W - padR, Y(alertY));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 序列
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(i), Y(p.y)) : ctx.lineTo(X(i), Y(p.y))));
    ctx.stroke();
    ctx.fillStyle = s.color;
    s.points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(X(i), Y(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
};

// 配适截面图: 角膜剖面 + 镜片背面剖面 + 泪膜间隙 (垂直放大)
export const drawCrossSection = (
  canvas: HTMLCanvasElement, c: CorneaParams, L: LensDesign, pose: LensPose,
): void => {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const rMax = L.diameter / 2 + 0.6;
  const zMax = 2.6; // mm 显示深度
  const X = (r: number) => W / 2 + (r / rMax) * (W / 2 - 16);
  const Y = (z: number) => 12 + (z / zMax) * (H - 40);
  // 角膜剖面
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k <= 200; k++) {
    const r = -rMax + (2 * rMax * k) / 200;
    const z = corneaZ(c, r, 0);
    if (!isFinite(z)) continue;
    k === 0 ? ctx.moveTo(X(r), Y(z)) : ctx.lineTo(X(r), Y(z));
  }
  ctx.stroke();
  // 镜片背面剖面 (含偏位)
  ctx.strokeStyle = "#1d4ed8";
  ctx.beginPath();
  let started = false;
  for (let k = 0; k <= 200; k++) {
    const r = -rMax + (2 * rMax * k) / 200;
    const rl = r - pose.lx;
    if (Math.abs(rl) > L.diameter / 2) { started = false; continue; }
    const z = lensSag(L, Math.abs(rl), 0) - pose.g;
    if (!isFinite(z)) continue;
    !started ? ctx.moveTo(X(r), Y(z)) : ctx.lineTo(X(r), Y(z));
    started = true;
  }
  ctx.stroke();
  // 泪膜填充 (角膜与镜片之间)
  ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
  ctx.beginPath();
  const pts: [number, number][] = [];
  for (let k = 0; k <= 200; k++) {
    const r = -rMax + (2 * rMax * k) / 200;
    const rl = r - pose.lx;
    if (Math.abs(rl) > L.diameter / 2) continue;
    const zc = corneaZ(c, r, 0);
    const zl = lensSag(L, Math.abs(rl), 0) - pose.g;
    if (isFinite(zc) && isFinite(zl) && zc >= zl) pts.push([r, zl]);
  }
  pts.forEach(([r, z], i) => (i === 0 ? ctx.moveTo(X(r), Y(z)) : ctx.lineTo(X(r), Y(z))));
  for (let i = pts.length - 1; i >= 0; i--) {
    const [r] = pts[i];
    ctx.lineTo(X(r), Y(corneaZ(c, r, 0)));
  }
  ctx.closePath();
  ctx.fill();
  // 图注
  ctx.fillStyle = "#64748b";
  ctx.font = "12px system-ui";
  ctx.fillText("角膜", X(-rMax) + 4, Y(corneaZ(c, -rMax + 0.3, 0)) - 6);
  ctx.fillText("镜片", X(rMax) - 40, Y(lensSag(L, L.diameter / 2 - 0.2, 0) - pose.g) - 6);
  ctx.fillText("垂直未按比例 (放大显示)", 12, H - 8);
};
