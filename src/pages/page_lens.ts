// 镜片设计页: 四/五弧参数调节 + 矢高平衡 + 截面图 + 订片单

import { store, uid } from "../data/store.ts";
import type { Order } from "../data/store.ts";
import { context } from "../main.ts";
import { corneaK } from "../core/cornea.ts";
import { defaultLens, autoBcRadius, zoneBounds, solveRcRadius } from "../core/lens.ts";
import type { LensDesign } from "../core/lens.ts";
import { solvePose, keyPoints } from "../core/tear_fit.ts";
import { el, clear, numField, checkField, button, readout, fmt } from "../ui/dom.ts";
import { drawCrossSection } from "../ui/charts.ts";

export const pageLens = (root: HTMLElement): void => {
  root.append(el("h1", "page-title", "镜片设计"));
  root.append(el("p", "page-sub", "反几何四弧/五弧设计, 修改降度自动重算基弧, 矢高平衡求静止位"));

  const ctx = context();
  const patient = store.getPatient(ctx.patientId);
  if (!patient) {
    root.append(el("div", "empty", "请先在患者档案中选择患者"));
    return;
  }
  const eye = patient.eyes[ctx.eye];
  const cornea = eye.cornea;
  if (!eye.lens) {
    eye.lens = defaultLens(cornea, Math.abs(eye.sphere));
    store.updatePatient(patient);
  }
  const L = eye.lens;
  // 旧档案兼容: 补齐新增字段
  if (L.apicalTarget === undefined) { L.apicalTarget = 15; L.rcAuto = false; }
  const settings = store.settings();

  const layout = el("div", "layout layout-2");
  root.append(layout);
  const left = el("div", "section-gap");
  const right = el("div", "section-gap");
  layout.append(left, right);

  const save = (): void => {
    if (L.bcAuto) L.bcRadius = autoBcRadius(cornea, L.targetReduction, L.compression);
    if (L.rcAuto) L.rcRadius = solveRcRadius(L, cornea);
    store.updatePatient(patient);
    renderRight();
  };

  // 左列: 参数面板
  const paramCard = el("div", "card");
  paramCard.append(el("div", "card-title", "设计参数"));
  paramCard.append(
    numField("目标降度", L.targetReduction, 0.25, (v) => { L.targetReduction = v; save(); }, "D"),
    numField("压缩系数", L.compression, 0.25, (v) => { L.compression = v; save(); }, "D"),
    checkField("基弧自动重算", L.bcAuto, (v) => { L.bcAuto = v; save(); }),
    numField("基弧半径", L.bcRadius, 0.01, (v) => { L.bcRadius = v; L.bcAuto = false; save(); }, "mm"),
    numField("光学区直径", L.ozd, 0.1, (v) => { L.ozd = v; save(); }, "mm"),
    numField("目标顶点间隙", L.apicalTarget, 1, (v) => { L.apicalTarget = v; save(); }, "μm"),
    checkField("反转弧自动求解", L.rcAuto, (v) => { L.rcAuto = v; save(); }),
    numField("反转弧半径", L.rcRadius, 0.05, (v) => { L.rcRadius = v; L.rcAuto = false; save(); }, "mm"),
    numField("反转弧宽", L.rcWidth, 0.05, (v) => { L.rcWidth = v; save(); }, "mm"),
    numField("定位弧半径", L.acRadius, 0.05, (v) => { L.acRadius = v; save(); }, "mm"),
    numField("定位弧宽", L.acWidth, 0.05, (v) => { L.acWidth = v; save(); }, "mm"),
    checkField("环曲定位弧", L.acToric, (v) => { L.acToric = v; save(); }),
    numField("环曲量 ΔR", L.acToricDelta, 0.05, (v) => { L.acToricDelta = v; save(); }, "mm"),
    checkField("五弧 (第二定位弧)", L.useAC2, (v) => { L.useAC2 = v; save(); }),
    numField("定位弧2半径", L.ac2Radius, 0.05, (v) => { L.ac2Radius = v; save(); }, "mm"),
    numField("定位弧2宽", L.ac2Width, 0.05, (v) => { L.ac2Width = v; save(); }, "mm"),
    numField("周边弧半径", L.pcRadius, 0.1, (v) => { L.pcRadius = v; save(); }, "mm"),
    numField("周边弧宽", L.pcWidth, 0.05, (v) => { L.pcWidth = v; save(); }, "mm"),
    numField("总直径", L.diameter, 0.1, (v) => { L.diameter = v; save(); }, "mm"),
  );
  const k = corneaK(cornea);
  if (k.cyl > 1.5 && !L.acToric) {
    paramCard.append(el("div", "alert", `角膜散光 ${fmt(k.cyl)} D > 1.50 D, 建议启用环曲定位弧`));
  }
  left.append(paramCard);

  // 右列: 截面图 + 读数 + 订片单
  const renderRight = (): void => {
    clear(right);
    const pose = solvePose(cornea, L);
    const kp = keyPoints(cornea, L, pose);
    const b = zoneBounds(L);

    const csCard = el("div", "card");
    csCard.append(el("div", "card-title", "配适截面 (水平子午线)"));
    const cs = document.createElement("canvas");
    cs.className = "plot-canvas";
    cs.style.height = "220px";
    csCard.append(cs);
    right.append(csCard);
    requestAnimationFrame(() => drawCrossSection(cs, cornea, L, pose));

    const readCard = el("div", "card");
    readCard.append(el("div", "card-title", "矢高平衡读数"));
    readCard.append(
      readout("基弧 (自动重算)", `${fmt(L.bcRadius)} mm (${fmt(337.5 / L.bcRadius)} D)`),
      readout("顶点间隙", fmt(kp.apical, 1) + " μm", kp.apical > 30 || kp.apical < 2),
      readout("反转弧池深", fmt(kp.rcPool, 1) + " μm"),
      readout("定位弧接触", fmt(kp.acTouch, 1) + " μm @ r=" + fmt(kp.touchRadius) + " mm"),
      readout("边翘", fmt(kp.edgeLift, 1) + " μm", kp.edgeLift < 20 || kp.edgeLift > 120),
      readout("反转弧外缘半径", fmt(b.rRC) + " mm"),
    );
    right.append(readCard);

    // 订片单
    const orderCard = el("div", "card");
    orderCard.append(el("div", "card-title", "订片单"));
    const text = formatOrder(L, patient.name, ctx.eye, settings.orderTemplate);
    const pre = el("div", "mono", text);
    orderCard.append(pre);
    const btnRow = el("div", "btn-row");
    btnRow.append(
      button("生成并存档", () => {
        const order: Order = {
          id: uid(), date: new Date().toISOString().slice(0, 10),
          patientId: patient.id, patientName: patient.name, eye: ctx.eye,
          lens: { ...L }, text,
        };
        store.addOrder(order);
        renderRight();
      }),
      button("复制文本", () => navigator.clipboard?.writeText(text), "btn btn-ghost"),
    );
    orderCard.append(btnRow);
    // 同参数历史
    const similar = store.findSimilarOrders(L);
    if (similar.length > 0) {
      orderCard.append(el("div", "card-title", `同参数历史 (${similar.length})`));
      const t = el("table", "data");
      t.innerHTML = "<thead><tr><th>日期</th><th>患者</th><th>眼别</th><th>基弧</th><th>定位弧</th></tr></thead>";
      const tb = el("tbody");
      for (const o of similar.slice(-8)) {
        const tr = el("tr");
        tr.append(
          el("td", "", o.date), el("td", "", o.patientName), el("td", "", o.eye),
          el("td", "", fmt(o.lens.bcRadius)), el("td", "", fmt(o.lens.acRadius)),
        );
        tb.append(tr);
      }
      t.append(tb);
      orderCard.append(t);
    }
    right.append(orderCard);
  };

  save();
};

// 订片单模板填充
export const formatOrder = (
  L: LensDesign, patientName: string, eye: string, template: string,
): string => {
  const toric = L.acToric ? ` (环曲 ΔR=${fmt(L.acToricDelta)}mm)` : "";
  const ac2 = L.useAC2 ? `\n定位弧2:${fmt(L.ac2Radius)}mm x ${fmt(L.ac2Width)}mm` : "";
  return template
    .replace("{patient}", patientName)
    .replace("{eye}", eye)
    .replace("{date}", new Date().toISOString().slice(0, 10))
    .replace("{name}", L.name)
    .replace("{target}", fmt(L.targetReduction))
    .replace("{compression}", fmt(L.compression))
    .replace("{bc}", fmt(L.bcRadius))
    .replace("{ozd}", fmt(L.ozd, 1))
    .replace("{rcR}", fmt(L.rcRadius))
    .replace("{rcW}", fmt(L.rcWidth))
    .replace("{acR}", fmt(L.acRadius))
    .replace("{acW}", fmt(L.acWidth))
    .replace("{toric}", toric + ac2)
    .replace("{pcR}", fmt(L.pcRadius))
    .replace("{pcW}", fmt(L.pcWidth))
    .replace("{dia}", fmt(L.diameter, 1));
};
