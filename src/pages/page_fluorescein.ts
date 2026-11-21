// 荧光染色模拟页: 钴蓝光染色图 + 眨眼动态 + 偏心对比 + 塑形预测

import { store } from "../data/store.ts";
import { context } from "../main.ts";
import { elevationMap } from "../core/cornea.ts";
import { defaultLens } from "../core/lens.ts";
import { solvePose, keyPoints, blinkOffset } from "../core/tear_fit.ts";
import type { LensPose } from "../core/tear_fit.ts";
import { treatmentDiffMap, analyzeBullseye } from "../core/treatment.ts";
import type { TreatmentParams } from "../core/treatment.ts";
import { zoneBounds } from "../core/lens.ts";
import { makeGrid } from "../core/math.ts";
import { GLView } from "../gl/gl_renderer.ts";
import { el, sliderField, checkField, button, readout, fmt } from "../ui/dom.ts";

const GRID = makeGrid(256, 6);

export const pageFluorescein = (root: HTMLElement): void => {
  root.append(el("h1", "page-title", "荧光染色模拟"));
  root.append(el("p", "page-sub", "钴蓝光 + 黄色滤光片, 泪膜厚度逐点解析计算, 眨眼动态与偏心对比"));

  const ctx = context();
  const patient = store.getPatient(ctx.patientId);
  if (!patient) {
    root.append(el("div", "empty", "请先在患者档案中选择患者"));
    return;
  }
  const eye = patient.eyes[ctx.eye];
  const cornea = eye.cornea;
  const L = eye.lens ?? defaultLens(cornea, Math.abs(eye.sphere));
  const settings = store.settings();

  // 状态
  let decenterX = 0, decenterY = 0;   // 静态偏位 mm
  let blinkAmp = 1.0;                 // 眨眼下压幅度 mm
  let blinkTau = 1.2;                 // 回弹时间常数 s
  let showRings = true;
  let blinkT = -1;                    // 眨眼计时, -1 静止
  let playing = false;

  const layout = el("div", "layout layout-3");
  root.append(layout);
  const ctrlCol = el("div", "section-gap");
  const midCol = el("div", "section-gap");
  const rightCol = el("div", "section-gap");
  layout.append(ctrlCol, midCol, rightCol);

  // 中列: 主染色图
  const mainCard = el("div", "card");
  mainCard.append(el("div", "card-title", "居中染色图"));
  const mainCanvas = document.createElement("canvas");
  mainCanvas.className = "gl-canvas";
  mainCanvas.style.aspectRatio = "1";
  mainCard.append(mainCanvas);
  midCol.append(mainCard);

  // 右列: 偏心对比图
  const decCard = el("div", "card");
  decCard.append(el("div", "card-title", "偏心/眨眼对比"));
  const decCanvas = document.createElement("canvas");
  decCanvas.className = "gl-canvas";
  decCanvas.style.aspectRatio = "1";
  decCard.append(decCanvas);
  const decLabel = el("div", "canvas-label", "当前偏位 0.00, 0.00 mm");
  decCard.append(decLabel);
  rightCol.append(decCard);

  const corneaMap = elevationMap(cornea, GRID);
  const mainView = new GLView(mainCanvas);
  const decView = new GLView(decCanvas);
  mainView.upload(corneaMap, GRID);
  decView.upload(corneaMap, GRID);

  const poseCentered = solvePose(cornea, L, 0, 0);

  const render = (): void => {
    const blinkDy = blinkT >= 0 ? blinkOffset(blinkT, blinkAmp, blinkTau) : 0;
    const lx = decenterX, ly = decenterY + blinkDy;
    const pose: LensPose = solvePose(cornea, L, lx, ly);
    mainView.renderFluor(L, poseCentered, settings.fluor, cornea.axis, showRings);
    decView.renderFluor(L, pose, settings.fluor, cornea.axis, showRings);
    decLabel.textContent = `当前偏位 ${fmt(lx)}, ${fmt(ly)} mm`;
  };

  // 眨眼动画
  const tick = (): void => {
    if (blinkT >= 0) {
      blinkT += 1 / 60;
      if (blinkT > 6) blinkT = playing ? -0.5 : -1; // 循环眨眼
      render();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // 左列: 控制 + 读数
  const ctrlCard = el("div", "card");
  ctrlCard.append(el("div", "card-title", "模拟控制"));
  ctrlCard.append(
    sliderField("水平偏位", 0, -2, 2, 0.05, (v) => { decenterX = v; render(); }, "mm"),
    sliderField("垂直偏位", 0, -2, 2, 0.05, (v) => { decenterY = v; render(); }, "mm"),
    sliderField("眨眼幅度", blinkAmp, 0, 2.5, 0.1, (v) => { blinkAmp = v; }, "mm"),
    sliderField("回弹 τ", blinkTau, 0.4, 3, 0.1, (v) => { blinkTau = v; }, "s"),
    checkField("显示弧段分界", showRings, (v) => { showRings = v; render(); }),
  );
  const blinkRow = el("div", "btn-row");
  blinkRow.append(
    button("眨一次", () => { blinkT = 0; }),
    button(playing ? "停止连续" : "连续眨眼", () => {
      playing = !playing;
      blinkT = playing ? 0 : -1;
      render();
    }, "btn btn-ghost"),
  );
  ctrlCard.append(blinkRow);
  ctrlCol.append(ctrlCard);

  // 关键点读数 (居中, 与手算矢高公式对照)
  const kp = keyPoints(cornea, L, poseCentered);
  const b = zoneBounds(L);
  const readCard = el("div", "card");
  readCard.append(el("div", "card-title", "关键点泪膜厚度 (居中)"));
  readCard.append(
    readout("顶点间隙", fmt(kp.apical, 1) + " μm"),
    readout(`基弧边缘 (r=${fmt(b.rBC)})`, fmt(kp.bcEdge, 1) + " μm"),
    readout("反转弧池深", fmt(kp.rcPool, 1) + " μm"),
    readout("定位弧接触", fmt(kp.acTouch, 1) + " μm"),
    readout("边翘", fmt(kp.edgeLift, 1) + " μm"),
  );
  ctrlCol.append(readCard);

  // 塑形预测: 差异地形 + 牛眼图
  const tz: TreatmentParams = {
    targetReduction: L.targetReduction,
    tzRadius: b.rRC,
    cx: decenterX, cy: decenterY,
  };
  const predCard = el("div", "card");
  predCard.append(el("div", "card-title", "塑形效果预测 (差异地形)"));
  const predCanvas = document.createElement("canvas");
  predCanvas.className = "gl-canvas";
  predCanvas.style.aspectRatio = "1";
  predCard.append(predCanvas);
  const bullReadout = el("div");
  predCard.append(bullReadout);
  midCol.append(predCard);
  const predView = new GLView(predCanvas);

  const renderPrediction = (): void => {
    tz.cx = decenterX; tz.cy = decenterY;
    const diff = treatmentDiffMap(cornea, tz, GRID);
    const um = new Float32Array(diff.length);
    let maxV = 0;
    for (let i = 0; i < diff.length; i++) {
      um[i] = diff[i] * 1000;
      if (isFinite(um[i]) && um[i] > maxV) maxV = um[i];
    }
    predView.upload(um, GRID);
    predView.renderMap(0, maxV || 1, [0.05, 0.05, 0.08]);
    const bull = analyzeBullseye(diff, GRID);
    bullReadout.replaceChildren(
      readout("牛眼偏心", `${fmt(bull.decenterMag)} mm (${fmt(bull.decenterX)}, ${fmt(bull.decenterY)})`, bull.decenterMag > settings.decenterAlert),
      readout("治疗区直径", fmt(bull.tzDiameter) + " mm", bull.tzDiameter < settings.tzDiameterMin),
    );
  };

  // 偏位变化时同步预测
  ctrlCard.addEventListener("input", () => renderPrediction());
  render();
  renderPrediction();
};
