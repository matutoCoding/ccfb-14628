// 角膜地形页: 轴向/切向曲率 + 高度差 + Placido 环反射

import { store } from "../data/store.ts";
import { context } from "../main.ts";
import {
  axialMap, tangentialMap, elevationDiffMap, bestFitSphere, corneaK, elevationMap,
} from "../core/cornea.ts";
import type { CorneaParams } from "../core/cornea.ts";
import { makeGrid } from "../core/math.ts";
import type { Grid } from "../core/math.ts";
import { GLView } from "../gl/gl_renderer.ts";
import { el, button, fmt } from "../ui/dom.ts";

const GRID: Grid = makeGrid(256, 6);

interface MapDef {
  key: string;
  label: string;
  unit: string;
  compute: (c: CorneaParams) => { data: Float32Array; min: number; max: number };
}

const MAPS: MapDef[] = [
  {
    key: "axial", label: "轴向曲率", unit: "D",
    compute: (c) => {
      const data = axialMap(c, GRID);
      const k = corneaK(c);
      return { data, min: k.kf - 2, max: k.ks + 2 };
    },
  },
  {
    key: "tangential", label: "切向曲率", unit: "D",
    compute: (c) => {
      const data = tangentialMap(c, GRID);
      const k = corneaK(c);
      return { data, min: k.kf - 3, max: k.ks + 3 };
    },
  },
  {
    key: "elevation", label: "高度差 (相对BFS)", unit: "μm",
    compute: (c) => {
      const Rbfs = bestFitSphere(c, 4);
      const data = elevationDiffMap(c, GRID, Rbfs);
      for (let i = 0; i < data.length; i++) data[i] *= 1000; // mm -> um
      let max = 0;
      for (const v of data) if (isFinite(v) && Math.abs(v) > max) max = Math.abs(v);
      return { data, min: -max, max };
    },
  },
];

export const pageTopography = (root: HTMLElement): void => {
  root.append(el("h1", "page-title", "角膜地形"));
  root.append(el("p", "page-sub", "高度数据生成轴向/切向曲率与高度差图, Placido 环按地形反推"));

  const ctx = context();
  const patient = store.getPatient(ctx.patientId);
  if (!patient) {
    root.append(el("div", "empty", "请先在患者档案中选择患者"));
    return;
  }
  const eye = patient.eyes[ctx.eye];
  let cornea: CorneaParams = eye.cornea;
  let imported: Float32Array | null = null; // 外部导入的高度数据 (mm)

  const layout = el("div", "section-gap");
  root.append(layout);

  // 工具行
  const toolbar = el("div", "card");
  const k = corneaK(cornea);
  const infoRow = el("div", "btn-row");
  infoRow.append(
    el("span", "tag", `${patient.name} · ${ctx.eye}`),
    el("span", "tag", `平K ${fmt(k.kf)} D`),
    el("span", "tag", `散光 ${fmt(k.cyl)} D`),
    el("span", "tag", `BFS ${fmt(bestFitSphere(cornea, 4))} mm`),
  );
  toolbar.append(infoRow);
  const importRow = el("div", "btn-row");
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".csv,.txt";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    const vals = text.split(/[\s,;]+/).map(parseFloat).filter((v) => isFinite(v));
    const n = Math.round(Math.sqrt(vals.length));
    if (n * n !== vals.length || n < 16) {
      alert("无法解析: 需要 N×N 的高度数据 (mm)");
      return;
    }
    imported = new Float32Array(vals);
    renderMaps();
  });
  importRow.append(
    button("导入高度数据 (CSV)", () => fileInput.click(), "btn btn-ghost"),
    button("恢复内置角膜", () => { imported = null; renderMaps(); }, "btn btn-ghost"),
  );
  toolbar.append(importRow, fileInput);
  layout.append(toolbar);

  // 图区
  const gridBox = el("div", "canvas-grid");
  layout.append(gridBox);
  const views: { def: MapDef; view: GLView }[] = [];
  let placidoView: GLView | null = null;

  for (const def of MAPS) {
    const wrap = el("div");
    const canvas = document.createElement("canvas");
    canvas.className = "gl-canvas";
    canvas.style.aspectRatio = "1";
    wrap.append(canvas, el("div", "canvas-label", def.label + " (" + def.unit + ")"));
    gridBox.append(wrap);
    views.push({ def, view: new GLView(canvas) });
  }
  const pWrap = el("div");
  const pCanvas = document.createElement("canvas");
  pCanvas.className = "gl-canvas";
  pCanvas.style.aspectRatio = "1";
  pWrap.append(pCanvas, el("div", "canvas-label", "Placido 环反射 (反推)"));
  gridBox.append(pWrap);
  placidoView = new GLView(pCanvas);

  const renderMaps = (): void => {
    for (const { def, view } of views) {
      const { data, min, max } = def.compute(cornea);
      view.upload(data, GRID);
      view.renderMap(min, max, [0.05, 0.05, 0.08]);
    }
    if (imported) {
      // 导入数据覆盖第一格显示原始高度 (mm)
      const n = Math.round(Math.sqrt(imported.length));
      const g: Grid = { n, half: 6, step: 12 / (n - 1) };
      let max = 0;
      for (const v of imported) if (isFinite(v) && v > max) max = v;
      views[0].view.upload(imported, g);
      views[0].view.renderMap(0, max || 1, [0.05, 0.05, 0.08]);
    }
    // Placido 用高度图反推
    placidoView!.upload(elevationMap(cornea, GRID), GRID);
    placidoView!.renderPlacido(80, 60, 1.2);
  };
  renderMaps();
};
