// 荧光素染色模型: 钴蓝激发 + 黄色滤光片观察
// 荧光强度: 薄层线性增长 -> 自吸收/浓度淬灭
// I(T) = (1 - exp(-a*T)) * exp(-T/b), T 单位 um

export interface FluorParams {
  a: number;   // 吸收系数 1/um, 控制薄层上升沿
  b: number;   // 淬灭长度 um, 控制厚区衰减
  gain: number;// 整体亮度
}

export const DEFAULT_FLUOR: FluorParams = { a: 0.28, b: 45, gain: 1.0 };

export const fluorIntensity = (tUm: number, p: FluorParams): number => {
  if (tUm <= 0 || !isFinite(tUm)) return 0;
  return p.gain * (1 - Math.exp(-p.a * tUm)) * Math.exp(-tUm / p.b);
};

// 归一化强度 -> RGB (钴蓝背景 + 黄绿荧光)
// 返回 [r,g,b] 0~1
export const fluorColor = (i: number): [number, number, number] => {
  const v = Math.min(Math.max(i, 0), 1);
  // 背景: 暗钴蓝 (激发光下的眼表)
  const br = 0.04, bg = 0.08, bb = 0.32;
  // 荧光: 黄绿 (经黄色滤光片)
  const fr = 0.75, fg = 1.0, fb = 0.15;
  return [
    br + (fr - br) * v,
    bg + (fg - bg) * v,
    bb + (fb - bb) * v,
  ];
};
