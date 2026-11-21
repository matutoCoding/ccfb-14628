// GLSL ES 3.00 着色器源码
// 三种渲染: 地形色阶图 / 荧光染色模拟 / Placido 环反射

export const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 公共: 双线性采样 R32F 高度/数据纹理
const COMMON = `
uniform sampler2D uData;
uniform vec2 uGrid;   // half(mm), n
uniform vec2 uRange;  // 值域 min,max
float sampleRaw(vec2 p) {
  vec2 f = (p / uGrid.x) * 0.5 + 0.5;   // mm -> uv
  vec2 g = f * (uGrid.y - 1.0);
  vec2 i0 = floor(g);
  vec2 t = g - i0;
  ivec2 n = ivec2(uGrid.y);
  ivec2 i00 = clamp(ivec2(i0), ivec2(0), n - 1);
  ivec2 i10 = clamp(i00 + ivec2(1,0), ivec2(0), n - 1);
  ivec2 i01 = clamp(i00 + ivec2(0,1), ivec2(0), n - 1);
  ivec2 i11 = clamp(i00 + ivec2(1,1), ivec2(0), n - 1);
  float v00 = texelFetch(uData, i00, 0).r;
  float v10 = texelFetch(uData, i10, 0).r;
  float v01 = texelFetch(uData, i01, 0).r;
  float v11 = texelFetch(uData, i11, 0).r;
  return mix(mix(v00, v10, t.x), mix(v01, v11, t.x), t.y);
}
vec2 mapPos(vec2 uv) {                  // uv -> mm (y 向上)
  return vec2(uv.x - 0.5, 0.5 - uv.y) * 2.0 * uGrid.x;
}
`;

// 地形色阶图: 角膜地形图仪风格 (蓝平 -> 绿 -> 红陡)
export const FRAG_MAP = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
${COMMON}
uniform vec3 uNaNColor;
vec3 palette(float t) {
  vec3 c0 = vec3(0.10, 0.25, 0.75); // 深蓝
  vec3 c1 = vec3(0.15, 0.65, 0.85); // 青
  vec3 c2 = vec3(0.25, 0.75, 0.35); // 绿
  vec3 c3 = vec3(0.95, 0.85, 0.25); // 黄
  vec3 c4 = vec3(0.90, 0.25, 0.15); // 红
  vec3 c5 = vec3(0.65, 0.10, 0.35); // 品红
  if (t < 0.2) return mix(c0, c1, t / 0.2);
  if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
  return mix(c4, c5, (t - 0.8) / 0.2);
}
void main() {
  vec2 p = mapPos(vUV);
  float v = sampleRaw(p);
  if (isnan(v) || length(p) > uGrid.x) { fragColor = vec4(uNaNColor, 1.0); return; }
  float t = clamp((v - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
  // 等值线
  float step_ = (uRange.y - uRange.x) / 20.0;
  float m = abs(fract(v / step_ + 0.5) - 0.5) * step_;
  float w = fwidth(v) * 1.2;
  float line = 1.0 - smoothstep(0.0, w, m);
  vec3 col = palette(t) * (1.0 - 0.25 * line);
  fragColor = vec4(col, 1.0);
}`;

// 荧光染色: 泪膜厚度在着色器内由矢高公式解析计算
export const FRAG_FLUOR = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
${COMMON}
// uData = 角膜高度图(mm); uRange 未用
uniform vec4 uB1;      // rBC, rRC, rAC1, rAC2
uniform vec4 uB2;      // rPC, lensRadius, useAC2, acToric
uniform vec4 uRad1;    // bcR, rcR, acR, ac2R
uniform vec4 uRad2;    // pcR, acToricDelta, axis(rad), gain
uniform vec3 uPose;    // g(mm), lx, ly
uniform vec3 uFluor;   // a(1/um), b(um), 备用
uniform float uRings;  // 是否画弧段分界线

float sphereSag(float R, float r) {
  float q = R * R - r * r;
  return q <= 0.0 ? R : R - sqrt(q);
}
float lensSag(float r, float theta) {
  float bcR = uRad1.x, rcR = uRad1.y;
  float acR = uRad1.z - uRad2.y * sin(theta) * sin(theta) * uB2.w;
  float s = sphereSag(bcR, r);
  if (r <= uB1.x) return s;
  float off = sphereSag(bcR, uB1.x) - sphereSag(rcR, uB1.x);
  s = sphereSag(rcR, r) + off;
  if (r <= uB1.y) return s;
  off += sphereSag(rcR, uB1.y) - sphereSag(acR, uB1.y);
  s = sphereSag(acR, r) + off;
  if (r <= uB1.z) return s;
  if (uB2.z > 0.5) {
    off += sphereSag(acR, uB1.z) - sphereSag(uRad1.w, uB1.z);
    s = sphereSag(uRad1.w, r) + off;
    if (r <= uB1.w) return s;
    off += sphereSag(uRad1.w, uB1.w) - sphereSag(uRad2.x, uB1.w);
    return sphereSag(uRad2.x, r) + off;
  }
  off += sphereSag(acR, uB1.z) - sphereSag(uRad2.x, uB1.z);
  return sphereSag(uRad2.x, r) + off;
}
void main() {
  vec2 p = mapPos(vUV);
  float zc = sampleRaw(p);
  vec2 pl = p - uPose.yz;
  float r = length(pl);
  float theta = atan(pl.y, pl.x) - uRad2.z;
  float T = 0.0;
  bool inLens = r <= uB2.y && !isnan(zc);
  if (inLens) T = (zc - lensSag(r, theta) + uPose.x) * 1000.0; // um
  float I = 0.0;
  if (T > 0.0) I = (1.0 - exp(-uFluor.x * T)) * exp(-T / uFluor.y);
  I = clamp(I * uRad2.w, 0.0, 1.0);
  // 钴蓝背景 + 黄绿荧光
  vec3 col = vec3(0.04, 0.08, 0.32);
  if (!inLens) col = vec3(0.02, 0.03, 0.10);
  col += I * vec3(0.72, 0.94, 0.05);
  // 弧段分界线
  if (uRings > 0.5 && inLens) {
    float d = min(min(abs(r - uB1.x), abs(r - uB1.y)), min(abs(r - uB1.z), abs(r - uB2.y)));
    float ring = 1.0 - smoothstep(0.0, 0.02, d);
    col = mix(col, vec3(1.0), ring * 0.35);
  }
  fragColor = vec4(col, 1.0);
}`;

// Placido 环反射: 由高度图求法线, 反射视线到环靶平面
export const FRAG_PLACIDO = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
${COMMON}
uniform vec3 uPlacido; // 相机距离 mm, 环靶距离 mm, 环间距 mm
void main() {
  vec2 p = mapPos(vUV);
  float z = sampleRaw(p);
  if (isnan(z) || length(p) > uGrid.x) { fragColor = vec4(0.06, 0.06, 0.07, 1.0); return; }
  float h = 2.0 * uGrid.x / (uGrid.y - 1.0);
  float zx = (sampleRaw(p + vec2(h, 0.0)) - sampleRaw(p - vec2(h, 0.0))) / (2.0 * h);
  float zy = (sampleRaw(p + vec2(0.0, h)) - sampleRaw(p - vec2(0.0, h))) / (2.0 * h);
  vec3 n = normalize(vec3(zx, zy, -1.0));      // 朝向眼外
  vec3 cam = vec3(0.0, 0.0, -uPlacido.x);
  vec3 v = normalize(vec3(p, z) - cam);
  vec3 rr = v - 2.0 * dot(v, n) * n;
  if (rr.z >= -1e-5) { fragColor = vec4(0.06, 0.06, 0.07, 1.0); return; }
  float t = (-uPlacido.y - z) / rr.z;          // 环靶平面 z = -uPlacido.y
  vec2 hit = p + t * rr.xy;
  float rho = length(hit);
  float ring = fract(rho / uPlacido.z);
  float b = smoothstep(0.35, 0.42, ring) * (1.0 - smoothstep(0.58, 0.65, ring));
  // 中央照孔
  if (rho < uPlacido.z * 0.8) b = 0.0;
  fragColor = vec4(vec3(0.05 + 0.95 * b), 1.0);
}`;
