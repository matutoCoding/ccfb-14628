// 复查对比页: 历次实测地形叠加对比 + 治疗区趋势 + 换片提醒

import { store } from "../data/store.ts";
import { context } from "../main.ts";
import { treatmentDiffMap, analyzeBullseye } from "../core/treatment.ts";
import { zoneBounds } from "../core/lens.ts";
import { makeGrid } from "../core/math.ts";
import { GLView } from "../gl/gl_renderer.ts";
import { el, clear, button, fmt } from "../ui/dom.ts";
import { drawTrend } from "../ui/charts.ts";

const GRID = makeGrid(256, 6);

export const pageFollowup = (root: HTMLElement): void => {
  root.append(el("h1", "page-title", "复查对比"));
  root.append(el("p", "page-sub", "历次实测地形与初始叠加对比, 治疗区直径与偏心量趋势"));

  const ctx = context();
  const patient = store.getPatient(ctx.patientId);
  if (!patient) {
    root.append(el("div", "empty", "请先在患者档案中选择患者"));
    return;
  }
  const eye = patient.eyes[ctx.eye];
  const cornea = eye.cornea;
  const settings = store.settings();
  const visits = eye.visits.filter((v) => v.treatment);

  const layout = el("div", "section-gap");
  root.append(layout);

  // 手工添加的复查可能缺实测地形, 提供模拟生成
  const missing = eye.visits.filter((v) => !v.treatment);
  if (missing.length > 0) {
    const box = el("div", "card");
    box.append(el("div", "", `${missing.length} 条复查记录尚未导入实测地形`));
    box.append(button("按当前镜片设计模拟生成", () => {
      for (const v of missing) {
        const b = eye.lens ? zoneBounds(eye.lens) : null;
        v.treatment = {
          cx: (Math.random() - 0.5) * 0.6,
          cy: (Math.random() - 0.5) * 0.6,
          tzRadius: b ? b.rRC : 2.8,
          reduction: eye.lens ? eye.lens.targetReduction : 3,
        };
      }
      store.updatePatient(patient);
      root.replaceChildren();
      pageFollowup(root);
    }));
    layout.append(box);
  }

  if (visits.length === 0) {
    const box = el("div", "card");
    box.append(el("div", "empty", "该眼暂无带地形数据的复查记录"));
    layout.append(box);
    return;
  }

  // 告警判定
  const last = visits[visits.length - 1];
  const lastDec = Math.hypot(last.treatment!.cx, last.treatment!.cy);
  const worsening =
    visits.length >= 3 &&
    visits.slice(-3).every((v, i, arr) =>
      i === 0 || Math.hypot(v.treatment!.cx, v.treatment!.cy) >=
        Math.hypot(arr[i - 1].treatment!.cx, arr[i - 1].treatment!.cy) - 0.02);
  if (lastDec > settings.decenterAlert || (worsening && lastDec > settings.decenterAlert * 0.7)) {
    layout.append(el("div", "alert",
      `最近复查偏心量 ${fmt(lastDec)} mm ${worsening ? "且持续增大" : ""}, 超过告警阈值 ${fmt(settings.decenterAlert)} mm, 建议评估换片 (收紧定位弧或改用环曲设计)`));
  } else {
    layout.append(el("div", "alert ok", `最近复查偏心量 ${fmt(lastDec)} mm, 在可接受范围内`));
  }

  // 趋势图
  const trendCard = el("div", "card");
  trendCard.append(el("div", "card-title", "复查趋势"));
  const trendCanvas = document.createElement("canvas");
  trendCanvas.className = "plot-canvas";
  trendCanvas.style.height = "240px";
  trendCard.append(trendCanvas);
  layout.append(trendCard);

  // 差异地形对比: 初始 vs 各次
  const mapCard = el("div", "card");
  mapCard.append(el("div", "card-title", "各次复查差异地形 (相对初始角膜)"));
  const mapGrid = el("div", "canvas-grid");
  mapCard.append(mapGrid);
  layout.append(mapCard);

  const renderMaps = (): void => {
    clear(mapGrid);
    for (const v of visits) {
      const t = v.treatment!;
      const diff = treatmentDiffMap(cornea, {
        targetReduction: t.reduction, tzRadius: t.tzRadius, cx: t.cx, cy: t.cy,
      }, GRID);
      const um = new Float32Array(diff.length);
      for (let i = 0; i < diff.length; i++) um[i] = diff[i] * 1000;
      const wrap = el("div");
      const canvas = document.createElement("canvas");
      canvas.className = "gl-canvas";
      canvas.style.aspectRatio = "1";
      const bull = analyzeBullseye(diff, GRID);
      wrap.append(canvas, el("div", "canvas-label",
        `${v.date} · 偏心 ${fmt(bull.decenterMag)} mm · TZ ${fmt(bull.tzDiameter)} mm`));
      mapGrid.append(wrap);
      const view = new GLView(canvas);
      view.upload(um, GRID);
      let max = 0;
      for (const x of um) if (isFinite(x) && x > max) max = x;
      view.renderMap(0, max || 1, [0.05, 0.05, 0.08]);
    }
  };

  // 相邻两次差异 (变化量)
  const deltaCard = el("div", "card");
  deltaCard.append(el("div", "card-title", "相邻复查间变化"));
  const deltaGrid = el("div", "canvas-grid");
  deltaCard.append(deltaGrid);
  layout.append(deltaCard);

  const renderDeltas = (): void => {
    clear(deltaGrid);
    for (let i = 1; i < visits.length; i++) {
      const a = visits[i - 1].treatment!, b = visits[i].treatment!;
      const da = treatmentDiffMap(cornea, { targetReduction: a.reduction, tzRadius: a.tzRadius, cx: a.cx, cy: a.cy }, GRID);
      const db = treatmentDiffMap(cornea, { targetReduction: b.reduction, tzRadius: b.tzRadius, cx: b.cx, cy: b.cy }, GRID);
      const delta = new Float32Array(da.length);
      let maxAbs = 0;
      for (let k = 0; k < da.length; k++) {
        delta[k] = isFinite(da[k]) && isFinite(db[k]) ? (db[k] - da[k]) * 1000 : NaN;
        if (isFinite(delta[k]) && Math.abs(delta[k]) > maxAbs) maxAbs = Math.abs(delta[k]);
      }
      const wrap = el("div");
      const canvas = document.createElement("canvas");
      canvas.className = "gl-canvas";
      canvas.style.aspectRatio = "1";
      wrap.append(canvas, el("div", "canvas-label",
        `${visits[i - 1].date} → ${visits[i].date} (μm)`));
      deltaGrid.append(wrap);
      const view = new GLView(canvas);
      view.upload(delta, GRID);
      view.renderMap(-maxAbs || -1, maxAbs || 1, [0.05, 0.05, 0.08]);
    }
  };

  // 复查表格 + 趋势渲染
  const tableCard = el("div", "card");
  tableCard.append(el("div", "card-title", "复查明细"));
  const t = el("table", "data");
  t.innerHTML = "<thead><tr><th>日期</th><th>眼轴 mm</th><th>偏心量 mm</th><th>治疗区直径 mm</th><th>状态</th></tr></thead>";
  const tb = el("tbody");
  for (const v of visits) {
    const tr = el("tr");
    const dec = Math.hypot(v.treatment!.cx, v.treatment!.cy);
    const tzD = v.treatment!.tzRadius * 2;
    const warn = dec > settings.decenterAlert;
    const tag = el("span", "tag " + (warn ? "danger" : "ok"), warn ? "偏心过大" : "正常");
    const tdTag = el("td");
    tdTag.append(tag);
    tr.append(
      el("td", "", v.date), el("td", "", fmt(v.axialLength)),
      el("td", "", fmt(dec)), el("td", "", fmt(tzD)), tdTag,
    );
    tb.append(tr);
  }
  t.append(tb);
  tableCard.append(t);
  layout.append(tableCard);

  requestAnimationFrame(() => {
    drawTrend(trendCanvas, [
      {
        label: "偏心量", color: "#dc2626",
        points: visits.map((v) => ({ x: v.date, y: Math.hypot(v.treatment!.cx, v.treatment!.cy) })),
      },
      {
        label: "治疗区直径", color: "#0e7490",
        points: visits.map((v) => ({ x: v.date, y: v.treatment!.tzRadius * 2 })),
      },
    ], "mm", settings.decenterAlert);
  });
  renderMaps();
  renderDeltas();
};
