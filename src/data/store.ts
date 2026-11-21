// 本地数据层: localStorage 持久化

import type { CorneaParams, CorneaKind } from "../core/cornea.ts";
import type { LensDesign } from "../core/lens.ts";
import type { FluorParams } from "../core/fluorescein.ts";
import { DEFAULT_FLUOR } from "../core/fluorescein.ts";

export type EyeSide = "OD" | "OS";

export interface Visit {
  id: string;
  date: string;          // YYYY-MM-DD
  axialLength: number;   // 眼轴 mm
  note: string;
  // 实测塑形效果 (由复查地形图导入/模拟)
  treatment: { cx: number; cy: number; tzRadius: number; reduction: number } | null;
}

export interface EyeRecord {
  sphere: number;        // 球镜 D (负值)
  cyl: number;           // 柱镜 D (负值)
  axis: number;          // 轴位 deg
  axialLength: number;   // 初始眼轴 mm
  corneaKind: CorneaKind;
  corneaSeed: number;
  cornea: CorneaParams;
  lens: LensDesign | null; // 当前镜片设计
  visits: Visit[];
}

export interface Patient {
  id: string;
  name: string;
  gender: "男" | "女";
  birth: string;         // YYYY-MM-DD
  parent: string;        // 家长联系方式
  eyes: { OD: EyeRecord; OS: EyeRecord };
  createdAt: string;
}

export interface Order {
  id: string;
  date: string;
  patientId: string;
  patientName: string;
  eye: EyeSide;
  lens: LensDesign;
  text: string;          // 按模板生成的订片单文本
}

export interface Settings {
  fluor: FluorParams;
  compression: number;       // 默认压缩系数 D
  decenterAlert: number;     // 偏心告警阈值 mm
  tzDiameterMin: number;     // 治疗区直径下限 mm
  orderTemplate: string;     // 订片单模板
}

export const DEFAULT_TEMPLATE =
  "订片单\n患者:{patient} 眼别:{eye} 日期:{date}\n设计:{name}\n降度:{target}D 压缩:{compression}D\n基弧:{bc}mm 光学区:{ozd}mm\n反转弧:{rcR}mm x {rcW}mm\n定位弧:{acR}mm x {acW}mm{toric}\n周边弧:{pcR}mm x {pcW}mm\n总直径:{dia}mm";

export const DEFAULT_SETTINGS: Settings = {
  fluor: { ...DEFAULT_FLUOR },
  compression: 0.75,
  decenterAlert: 1.0,
  tzDiameterMin: 3.0,
  orderTemplate: DEFAULT_TEMPLATE,
};

const KEY = {
  patients: "okls_patients",
  orders: "okls_orders",
  settings: "okls_settings",
  context: "okls_context",
};

const read = <T>(key: string, fallback: T): T => {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, v: unknown): void => {
  localStorage.setItem(key, JSON.stringify(v));
};

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const store = {
  patients: (): Patient[] => read(KEY.patients, []),
  savePatients: (p: Patient[]): void => write(KEY.patients, p),
  orders: (): Order[] => read(KEY.orders, []),
  saveOrders: (o: Order[]): void => write(KEY.orders, o),
  settings: (): Settings => ({
    ...DEFAULT_SETTINGS,
    fluor: { ...DEFAULT_SETTINGS.fluor },
    ...read(KEY.settings, {}),
  }),
  saveSettings: (s: Settings): void => write(KEY.settings, s),
  context: (): { patientId: string; eye: EyeSide } =>
    read(KEY.context, { patientId: "", eye: "OD" }),
  saveContext: (c: { patientId: string; eye: EyeSide }): void => write(KEY.context, c),

  getPatient(id: string): Patient | null {
    return this.patients().find((p) => p.id === id) ?? null;
  },
  updatePatient(p: Patient): void {
    const all = this.patients();
    const i = all.findIndex((x) => x.id === p.id);
    if (i >= 0) all[i] = p; else all.push(p);
    this.savePatients(all);
  },
  deletePatient(id: string): void {
    this.savePatients(this.patients().filter((p) => p.id !== id));
  },
  addOrder(o: Order): void {
    const all = this.orders();
    all.push(o);
    this.saveOrders(all);
  },
  // 同参数历史配镜查询: 按关键参数匹配
  findSimilarOrders(lens: LensDesign): Order[] {
    const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
    return this.orders().filter(
      (o) =>
        close(o.lens.bcRadius, lens.bcRadius, 0.02) &&
        close(o.lens.acRadius, lens.acRadius, 0.02) &&
        close(o.lens.ozd, lens.ozd, 0.1) &&
        close(o.lens.targetReduction, lens.targetReduction, 0.25),
    );
  },
  exportAll(): string {
    return JSON.stringify(
      { patients: this.patients(), orders: this.orders(), settings: this.settings() },
      null, 2,
    );
  },
  importAll(json: string): void {
    const d = JSON.parse(json);
    if (d.patients) this.savePatients(d.patients);
    if (d.orders) this.saveOrders(d.orders);
    if (d.settings) this.saveSettings(d.settings);
  },
  clearAll(): void {
    Object.values(KEY).forEach((k) => localStorage.removeItem(k));
  },
};
