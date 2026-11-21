// 设置页: 荧光模型参数 + 告警阈值 + 订片单模板 + 数据管理 + 几何验证

import { store } from "../data/store.ts";
import { runValidation } from "../core/validate.ts";
import { el, clear, numField, button, fmt } from "../ui/dom.ts";

export const pageSettings = (root: HTMLElement): void => {
  root.append(el("h1", "page-title", "设置"));
  root.append(el("p", "page-sub", "荧光模型、告警阈值、订片单模板与数据管理"));

  const settings = store.settings();
  const layout = el("div", "layout layout-2");
  root.append(layout);
  const left = el("div", "section-gap");
  const right = el("div", "section-gap");
  layout.append(left, right);

  // 荧光模型
  const fluorCard = el("div", "card");
  fluorCard.append(el("div", "card-title", "荧光染色模型"));
  fluorCard.append(
    numField("吸收系数 a", settings.fluor.a, 0.01, (v) => { settings.fluor.a = v; save(); }, "1/μm"),
    numField("淬灭长度 b", settings.fluor.b, 1, (v) => { settings.fluor.b = v; save(); }, "μm"),
    numField("亮度增益", settings.fluor.gain, 0.05, (v) => { settings.fluor.gain = v; save(); }),
  );
  left.append(fluorCard);

  // 临床阈值
  const clinCard = el("div", "card");
  clinCard.append(el("div", "card-title", "临床阈值"));
  clinCard.append(
    numField("默认压缩系数", settings.compression, 0.25, (v) => { settings.compression = v; save(); }, "D"),
    numField("偏心告警", settings.decenterAlert, 0.1, (v) => { settings.decenterAlert = v; save(); }, "mm"),
    numField("治疗区下限", settings.tzDiameterMin, 0.1, (v) => { settings.tzDiameterMin = v; save(); }, "mm"),
  );
  left.append(clinCard);

  // 订片单模板
  const tplCard = el("div", "card");
  tplCard.append(el("div", "card-title", "订片单模板 (发给镜片厂的格式)"));
  const tpl = document.createElement("textarea");
  tpl.value = settings.orderTemplate;
  tpl.addEventListener("change", () => { settings.orderTemplate = tpl.value; save(); });
  tplCard.append(tpl);
  tplCard.append(el("div", "canvas-label",
    "占位符: {patient} {eye} {date} {name} {target} {compression} {bc} {ozd} {rcR} {rcW} {acR} {acW} {toric} {pcR} {pcW} {dia}"));
  left.append(tplCard);

  // 数据管理
  const dataCard = el("div", "card");
  dataCard.append(el("div", "card-title", "数据管理"));
  const row1 = el("div", "btn-row");
  row1.append(
    button("导出全部数据", () => {
      const blob = new Blob([store.exportAll()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "oklens_backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "btn btn-ghost"),
  );
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".json";
  importInput.style.display = "none";
  importInput.addEventListener("change", async () => {
    const f = importInput.files?.[0];
    if (!f) return;
    store.importAll(await f.text());
    location.reload();
  });
  row1.append(
    button("导入数据", () => importInput.click(), "btn btn-ghost"),
    button("清空全部数据", () => {
      store.clearAll();
      location.reload();
    }, "btn btn-danger"),
  );
  dataCard.append(row1, importInput);
  left.append(dataCard);

  // 几何验证报告
  const valCard = el("div", "card");
  valCard.append(el("div", "card-title", "几何精度验证 (对照手算矢高公式)"));
  const valBody = el("div", "section-gap");
  valCard.append(valBody);
  right.append(valCard);

  const renderValidation = (): void => {
    clear(valBody);
    const rows = runValidation();
    const allPass = rows.every((r) => r.pass);
    valBody.append(el("div", allPass ? "alert ok" : "alert",
      allPass ? "全部关键点误差 < 2 μm, 通过" : "存在超差点位, 请检查"));
    const t = el("table", "data");
    t.innerHTML = "<thead><tr><th>点位</th><th>引擎 μm</th><th>手算 μm</th><th>误差 μm</th><th></th></tr></thead>";
    const tb = el("tbody");
    for (const r of rows) {
      const tr = el("tr");
      const tag = el("span", "tag " + (r.pass ? "ok" : "danger"), r.pass ? "通过" : "超差");
      const td = el("td");
      td.append(tag);
      tr.append(
        el("td", "", r.name),
        el("td", "", fmt(r.engine, 2)),
        el("td", "", fmt(r.hand, 2)),
        el("td", "", fmt(r.error, 3)),
        td,
      );
      tb.append(tr);
    }
    t.append(tb);
    valBody.append(t);
  };
  valCard.append(button("重新验证", renderValidation, "btn btn-ghost"));
  renderValidation();

  // 订片单历史
  const orders = store.orders();
  const histCard = el("div", "card");
  histCard.append(el("div", "card-title", `订片单存档 (${orders.length})`));
  if (orders.length > 0) {
    const t = el("table", "data");
    t.innerHTML = "<thead><tr><th>日期</th><th>患者</th><th>眼别</th><th>基弧</th><th>降度</th></tr></thead>";
    const tb = el("tbody");
    for (const o of orders.slice().reverse()) {
      const tr = el("tr");
      tr.append(
        el("td", "", o.date), el("td", "", o.patientName), el("td", "", o.eye),
        el("td", "", fmt(o.lens.bcRadius)), el("td", "", fmt(o.lens.targetReduction)),
      );
      tr.addEventListener("click", () => {
        const win = el("div", "card");
        win.append(el("pre", "mono", o.text));
        histCard.append(win);
      });
      tb.append(tr);
    }
    t.append(tb);
    histCard.append(t);
  } else {
    histCard.append(el("div", "empty", "暂无订片单"));
  }
  right.append(histCard);

  function save(): void {
    store.saveSettings(settings);
  }
};
