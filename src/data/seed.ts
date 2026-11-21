// 测试数据生成: 患者档案 + 模拟角膜 + 复查记录

import { generateCornea } from "../core/cornea.ts";
import type { CorneaKind } from "../core/cornea.ts";
import { rng } from "../core/math.ts";
import { store, uid } from "./store.ts";
import type { Patient, EyeRecord, Visit } from "./store.ts";

const makeEye = (
  kind: CorneaKind, seed: number, sphere: number, cyl: number, axis: number, al: number,
): EyeRecord => ({
  sphere, cyl, axis,
  axialLength: al,
  corneaKind: kind,
  corneaSeed: seed,
  cornea: generateCornea(kind, seed),
  lens: null,
  visits: [],
});

// 生成一串复查记录: trend > 0 表示偏心逐次恶化
const makeVisits = (
  seed: number, count: number, startDate: string,
  baseAL: number, decX: number, decY: number, trend: number,
): Visit[] => {
  const rand = rng(seed);
  const out: Visit[] = [];
  const d = new Date(startDate);
  for (let i = 0; i < count; i++) {
    d.setMonth(d.getMonth() + 1);
    const wob = () => (rand() - 0.5) * 0.12;
    out.push({
      id: uid() + i,
      date: d.toISOString().slice(0, 10),
      axialLength: baseAL + i * (0.02 + rand() * 0.03),
      note: i === 0 ? "戴镜后首次复查" : "",
      treatment: {
        cx: decX + trend * i + wob(),
        cy: decY + trend * i * 0.6 + wob(),
        tzRadius: 2.6 + rand() * 0.5,
        reduction: 2.5 + rand() * 1.0,
      },
    });
  }
  return out;
};

export const seedIfEmpty = (): void => {
  if (store.patients().length > 0) return;
  const P = (
    name: string, gender: "男" | "女", birth: string, parent: string,
    od: EyeRecord, os: EyeRecord,
  ): Patient => ({
    id: uid(), name, gender, birth, parent,
    eyes: { OD: od, OS: os }, createdAt: new Date().toISOString(),
  });

  const patients: Patient[] = [
    P("陈小雨", "女", "2016-03-12", "陈女士 138****2201",
      { ...makeEye("symmetric", 101, -2.75, -0.50, 175, 24.12),
        visits: makeVisits(11, 4, "2026-05-10", 24.12, 0.15, -0.1, 0.02) },
      makeEye("symmetric", 102, -3.00, -0.25, 10, 24.20)),
    P("林子豪", "男", "2014-08-25", "林先生 139****8834",
      { ...makeEye("wtr_astig", 201, -4.25, -2.25, 180, 24.85),
        visits: makeVisits(21, 5, "2026-03-02", 24.85, 0.3, -0.25, 0.14) },
      { ...makeEye("wtr_astig", 202, -4.00, -2.00, 175, 24.78),
        visits: makeVisits(22, 5, "2026-03-02", 24.78, 0.25, -0.2, 0.1) }),
    P("王可欣", "女", "2017-01-30", "王女士 137****5520",
      makeEye("decentered", 301, -1.75, -1.00, 165, 23.55),
      { ...makeEye("decentered", 302, -2.00, -0.75, 15, 23.61),
        visits: makeVisits(31, 3, "2026-06-18", 23.61, -0.35, 0.3, 0.05) }),
    P("张一鸣", "男", "2015-11-02", "张先生 136****7745",
      { ...makeEye("oblique_astig", 401, -3.50, -1.75, 45, 24.40),
        visits: makeVisits(41, 4, "2026-04-22", 24.40, 0.5, 0.35, 0.12) },
      makeEye("symmetric", 402, -3.25, -0.50, 170, 24.33)),
    P("刘思远", "男", "2013-05-19", "刘女士 135****3312",
      makeEye("atr_astig", 501, -5.00, -1.50, 90, 25.30),
      makeEye("atr_astig", 502, -4.75, -1.25, 85, 25.22)),
    P("赵梦琪", "女", "2016-09-08", "赵女士 150****9967",
      { ...makeEye("symmetric", 601, -2.25, -0.75, 5, 23.98),
        visits: makeVisits(61, 6, "2026-02-14", 23.98, 0.1, 0.05, -0.01) },
      makeEye("symmetric", 602, -2.50, -0.50, 178, 24.05)),
  ];
  store.savePatients(patients);
};
