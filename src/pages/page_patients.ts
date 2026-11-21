// 患者档案页: 列表 + 验光/眼轴 + 复查记录管理

import { store, uid } from "../data/store.ts";
import type { Patient, EyeRecord, EyeSide } from "../data/store.ts";
import { generateCornea, CORNEA_KIND_LABEL, corneaK } from "../core/cornea.ts";
import type { CorneaKind } from "../core/cornea.ts";
import { el, clear, numField, selectField, button, fmt } from "../ui/dom.ts";
import { context, setContext } from "../main.ts";

const KINDS = Object.entries(CORNEA_KIND_LABEL) as [CorneaKind, string][];

const eyeForm = (
  eye: EyeRecord, side: EyeSide, onChange: () => void,
): HTMLElement => {
  const card = el("div", "card");
  card.append(el("div", "card-title", side === "OD" ? "右眼 OD" : "左眼 OS"));
  card.append(
    numField("球镜", eye.sphere, 0.25, (v) => { eye.sphere = v; onChange(); }, "D"),
    numField("柱镜", eye.cyl, 0.25, (v) => { eye.cyl = v; onChange(); }, "D"),
    numField("轴位", eye.axis, 5, (v) => { eye.axis = v; onChange(); }, "°"),
    numField("眼轴", eye.axialLength, 0.01, (v) => { eye.axialLength = v; onChange(); }, "mm"),
    selectField("角膜类型", KINDS, eye.corneaKind, (v) => {
      eye.corneaKind = v;
      eye.cornea = generateCornea(v, eye.corneaSeed);
      onChange();
    }),
    numField("随机种子", eye.corneaSeed, 1, (v) => {
      eye.corneaSeed = Math.round(v);
      eye.cornea = generateCornea(eye.corneaKind, eye.corneaSeed);
      onChange();
    }),
  );
  const k = corneaK(eye.cornea);
  const info = el("div", "");
  info.append(
    el("div", "readout", ""),
    row("平K / 陡K", `${fmt(k.kf)} / ${fmt(k.ks)} D`),
    row("角膜散光", `${fmt(k.cyl)} D`),
    row("顶点偏心", `${fmt(eye.cornea.dx)} , ${fmt(eye.cornea.dy)} mm`),
  );
  card.append(info);
  return card;
};

const row = (label: string, value: string): HTMLElement => {
  const r = el("div", "readout");
  r.append(el("span", "readout-label", label), el("span", "readout-value", value));
  return r;
};

const visitTable = (eye: EyeRecord, onChange: () => void): HTMLElement => {
  const card = el("div", "card");
  card.append(el("div", "card-title", "复查记录"));
  if (eye.visits.length === 0) {
    card.append(el("div", "empty", "暂无复查记录"));
  } else {
    const t = el("table", "data");
    t.innerHTML = "<thead><tr><th>日期</th><th>眼轴 mm</th><th>治疗区偏心 mm</th><th>备注</th><th></th></tr></thead>";
    const tb = el("tbody");
    for (const v of eye.visits) {
      const tr = el("tr");
      const dec = v.treatment
        ? Math.hypot(v.treatment.cx, v.treatment.cy).toFixed(2)
        : "—";
      tr.append(
        el("td", "", v.date),
        el("td", "", fmt(v.axialLength)),
        el("td", "", dec),
        el("td", "", v.note),
      );
      const del = button("删除", () => {
        eye.visits = eye.visits.filter((x) => x.id !== v.id);
        onChange();
      }, "btn btn-ghost");
      const td = el("td");
      td.append(del);
      tr.append(td);
      tb.append(tr);
    }
    t.append(tb);
    card.append(t);
  }
  // 新增复查
  const addRow = el("div", "btn-row");
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = new Date().toISOString().slice(0, 10);
  const alInput = document.createElement("input");
  alInput.type = "number";
  alInput.step = "0.01";
  alInput.placeholder = "眼轴 mm";
  addRow.append(dateInput, alInput);
  addRow.append(button("添加复查", () => {
    const al = parseFloat(alInput.value);
    if (!isFinite(al)) return;
    // 实测地形由复查页模拟生成, 这里先记录眼轴
    eye.visits.push({
      id: uid(), date: dateInput.value, axialLength: al, note: "", treatment: null,
    });
    eye.visits.sort((a, b) => a.date.localeCompare(b.date));
    onChange();
  }));
  card.append(addRow);
  return card;
};

export const pagePatients = (root: HTMLElement): void => {
  const patients = store.patients();
  const ctx = context();
  let current = patients.find((p) => p.id === ctx.patientId) ?? patients[0] ?? null;

  root.append(el("h1", "page-title", "患者档案"));
  root.append(el("p", "page-sub", "验光度数、眼轴长度与复查记录, 左右眼分开管理"));

  const layout = el("div", "layout layout-2");
  root.append(layout);

  // 左列: 患者列表
  const listCard = el("div", "card");
  listCard.append(el("div", "card-title", "患者列表"));
  const renderList = (): void => {
    clear(listCard);
    listCard.append(el("div", "card-title", "患者列表"));
    const all = store.patients();
    if (all.length === 0) {
      listCard.append(el("div", "empty", "暂无患者"));
      return;
    }
    const t = el("table", "data");
    const tb = el("tbody");
    for (const p of all) {
      const tr = el("tr", p.id === current?.id ? "selected" : "");
      const age = Math.floor(
        (Date.now() - new Date(p.birth).getTime()) / (365.25 * 86400e3),
      );
      tr.append(
        el("td", "", p.name),
        el("td", "", p.gender),
        el("td", "", age + " 岁"),
        el("td", "", p.eyes.OD.visits.length + p.eyes.OS.visits.length + " 次复查"),
      );
      tr.addEventListener("click", () => {
        current = p;
        setContext(p.id, context().eye);
        renderAll();
      });
      tb.append(tr);
    }
    t.append(tb);
    listCard.append(t);
    listCard.append(button("新建患者", () => {
      const p: Patient = {
        id: uid(), name: "新患者", gender: "男",
        birth: "2016-01-01", parent: "",
        eyes: {
          OD: { sphere: -3, cyl: -0.5, axis: 180, axialLength: 24, corneaKind: "symmetric", corneaSeed: Math.floor(Math.random() * 9999), cornea: generateCornea("symmetric", 1), lens: null, visits: [] },
          OS: { sphere: -3, cyl: -0.5, axis: 180, axialLength: 24, corneaKind: "symmetric", corneaSeed: Math.floor(Math.random() * 9999), cornea: generateCornea("symmetric", 2), lens: null, visits: [] },
        },
        createdAt: new Date().toISOString(),
      };
      p.eyes.OD.cornea = generateCornea("symmetric", p.eyes.OD.corneaSeed);
      p.eyes.OS.cornea = generateCornea("symmetric", p.eyes.OS.corneaSeed);
      store.updatePatient(p);
      current = p;
      setContext(p.id, "OD");
      renderAll();
    }));
  };

  // 右列: 当前患者详情
  const detail = el("div", "section-gap");
  const renderDetail = (): void => {
    clear(detail);
    if (!current) {
      detail.append(el("div", "empty", "请选择或新建患者"));
      return;
    }
    const save = (): void => { store.updatePatient(current!); renderDetail(); };
    const info = el("div", "card");
    info.append(el("div", "card-title", "基本信息"));
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = current.name;
    nameInput.addEventListener("change", () => { current!.name = nameInput.value; save(); });
    const nameRow = el("label", "field");
    nameRow.append(el("span", "field-label", "姓名"), nameInput);
    info.append(
      nameRow,
      selectField("性别", [["男", "男"], ["女", "女"]], current.gender, (v) => {
        current!.gender = v; save();
      }),
    );
    const birthRow = el("label", "field");
    const birthInput = document.createElement("input");
    birthInput.type = "date";
    birthInput.value = current.birth;
    birthInput.addEventListener("change", () => { current!.birth = birthInput.value; save(); });
    birthRow.append(el("span", "field-label", "出生日期"), birthInput);
    info.append(birthRow);
    const parentRow = el("label", "field");
    const parentInput = document.createElement("input");
    parentInput.type = "text";
    parentInput.value = current.parent;
    parentInput.placeholder = "家长姓名 电话";
    parentInput.addEventListener("change", () => { current!.parent = parentInput.value; save(); });
    parentRow.append(el("span", "field-label", "家长联系"), parentInput);
    info.append(parentRow);
    info.append(button("删除该患者", () => {
      store.deletePatient(current!.id);
      current = store.patients()[0] ?? null;
      renderAll();
    }, "btn btn-danger"));
    detail.append(info);

    const eye = current.eyes[context().eye];
    detail.append(eyeForm(eye, context().eye, save));
    detail.append(visitTable(eye, save));
  };

  const renderAll = (): void => { renderList(); renderDetail(); };
  layout.append(listCard, detail);
  renderAll();
};
