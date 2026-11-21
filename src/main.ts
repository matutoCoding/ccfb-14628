// 应用入口: hash 路由 + 全局患者上下文

import { store } from "./data/store.ts";
import type { EyeSide } from "./data/store.ts";
import { seedIfEmpty } from "./data/seed.ts";
import { el, clear } from "./ui/dom.ts";
import { pagePatients } from "./pages/page_patients.ts";
import { pageTopography } from "./pages/page_topography.ts";
import { pageLens } from "./pages/page_lens.ts";
import { pageFluorescein } from "./pages/page_fluorescein.ts";
import { pageFollowup } from "./pages/page_followup.ts";
import { pageSettings } from "./pages/page_settings.ts";

const ICONS: Record<string, string> = {
  patients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14.5c2.1.7 3.5 2.6 3.5 5.5"/></svg>',
  topography: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="6" ry="4.5"/><ellipse cx="12" cy="12" rx="2.5" ry="1.8"/></svg>',
  lens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 9c2-2.5 4.5-4 8-4s6 1.5 8 4"/><path d="M4 9v6c0 2.2 3.6 4 8 4s8-1.8 8-4V9"/><path d="M4 9c2 2 4.5 3 8 3s6-1 8-3"/></svg>',
  fluorescein: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  followup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 17l5-6 4 3 6-8"/><path d="M3 21h18"/><circle cx="18" cy="6" r="1.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
};

const ROUTES: [string, string, (root: HTMLElement) => void][] = [
  ["patients", "患者档案", pagePatients],
  ["topography", "角膜地形", pageTopography],
  ["lens", "镜片设计", pageLens],
  ["fluorescein", "荧光染色模拟", pageFluorescein],
  ["followup", "复查对比", pageFollowup],
  ["settings", "设置", pageSettings],
];

// 全局上下文: 当前患者与眼别
export const context = () => store.context();
export const setContext = (patientId: string, eye: EyeSide): void => {
  store.saveContext({ patientId, eye });
  renderNavContext();
};

const renderNavContext = (): void => {
  const box = document.getElementById("nav-context")!;
  clear(box);
  const patients = store.patients();
  const ctx = store.context();
  box.append(el("div", "", "当前患者"));
  const sel = document.createElement("select");
  for (const p of patients) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    if (p.id === ctx.patientId) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener("change", () => {
    setContext(sel.value, store.context().eye);
    route();
  });
  const eyeRow = el("div", "btn-row");
  for (const side of ["OD", "OS"] as EyeSide[]) {
    const b = document.createElement("button");
    b.className = "btn " + (ctx.eye === side ? "" : "btn-ghost");
    b.textContent = side === "OD" ? "右眼 OD" : "左眼 OS";
    b.style.flex = "1";
    b.addEventListener("click", () => {
      setContext(store.context().patientId, side);
      route();
    });
    eyeRow.append(b);
  }
  box.append(sel, eyeRow);
};

const route = (): void => {
  const hash = location.hash.replace(/^#\/?/, "") || "patients";
  const main = document.getElementById("main")!;
  clear(main);
  const entry = ROUTES.find(([k]) => k === hash) ?? ROUTES[0];
  document.querySelectorAll("#nav-links a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "#/" + entry[0]);
  });
  entry[2](main);
};

const init = (): void => {
  seedIfEmpty();
  const links = document.getElementById("nav-links")!;
  for (const [key, label] of ROUTES) {
    const a = document.createElement("a");
    a.href = "#/" + key;
    a.innerHTML = ICONS[key] + "<span>" + label + "</span>";
    links.append(a);
  }
  // 默认选中第一个患者
  const ctx = store.context();
  const patients = store.patients();
  if (!ctx.patientId && patients.length > 0)
    store.saveContext({ patientId: patients[0].id, eye: "OD" });
  renderNavContext();
  window.addEventListener("hashchange", route);
  route();
};

init();
