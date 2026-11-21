// WebGL2 渲染器: 全屏四边形 + 数据纹理 + 三种着色程序

import { VERT, FRAG_MAP, FRAG_FLUOR, FRAG_PLACIDO } from "./gl_shaders.ts";
import type { Grid } from "../core/math.ts";
import type { LensDesign } from "../core/lens.ts";
import { zoneBounds } from "../core/lens.ts";
import type { LensPose } from "../core/tear_fit.ts";
import type { FluorParams } from "../core/fluorescein.ts";
import { DEG } from "../core/math.ts";

const compile = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader => {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error("shader: " + gl.getShaderInfoLog(s));
  return s;
};

const makeProgram = (gl: WebGL2RenderingContext, fragSrc: string): WebGLProgram => {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error("link: " + gl.getProgramInfoLog(p));
  return p;
};

export class GLView {
  private gl: WebGL2RenderingContext;
  private progMap: WebGLProgram;
  private progFluor: WebGLProgram;
  private progPlacido: WebGLProgram;
  private tex: WebGLTexture;
  private grid: Grid = { n: 0, half: 0, step: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) throw new Error("WebGL2 不可用");
    this.gl = gl;
    this.progMap = makeProgram(gl, FRAG_MAP);
    this.progFluor = makeProgram(gl, FRAG_FLUOR);
    this.progPlacido = makeProgram(gl, FRAG_PLACIDO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!;
  }

  // 上传标量场 (mm 或任意单位, 与渲染程序约定一致)
  upload(data: Float32Array, g: Grid): void {
    const gl = this.gl;
    this.grid = g;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, g.n, g.n, 0, gl.RED, gl.FLOAT, data);
  }

  private begin(prog: WebGLProgram): void {
    const gl = this.gl;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth * dpr, h = this.canvas.clientHeight * dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(gl.getUniformLocation(prog, "uData"), 0);
    gl.uniform2f(gl.getUniformLocation(prog, "uGrid"), this.grid.half, this.grid.n);
  }

  private u(name: string): WebGLUniformLocation | null {
    const prog = this.gl.getParameter(this.gl.CURRENT_PROGRAM) as WebGLProgram;
    return this.gl.getUniformLocation(prog, name);
  }

  // 地形色阶图
  renderMap(min: number, max: number, bg: [number, number, number]): void {
    this.begin(this.progMap);
    this.gl.uniform2f(this.u("uRange"), min, max);
    this.gl.uniform3f(this.u("uNaNColor"), bg[0], bg[1], bg[2]);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  // 荧光染色模拟
  renderFluor(L: LensDesign, pose: LensPose, f: FluorParams, corneaAxis: number, showRings: boolean): void {
    const b = zoneBounds(L);
    this.begin(this.progFluor);
    const gl = this.gl;
    gl.uniform2f(this.u("uRange"), 0, 1);
    gl.uniform4f(this.u("uB1"), b.rBC, b.rRC, b.rAC1, b.rAC2);
    gl.uniform4f(this.u("uB2"), b.rPC, L.diameter / 2, L.useAC2 ? 1 : 0, L.acToric ? 1 : 0);
    gl.uniform4f(this.u("uRad1"), L.bcRadius, L.rcRadius, L.acRadius, L.ac2Radius);
    gl.uniform4f(this.u("uRad2"), L.pcRadius, L.acToricDelta, corneaAxis * DEG, f.gain);
    gl.uniform3f(this.u("uPose"), pose.g, pose.lx, pose.ly);
    gl.uniform3f(this.u("uFluor"), f.a, f.b, 0);
    gl.uniform1f(this.u("uRings"), showRings ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Placido 环反射
  renderPlacido(camDist: number, ringDist: number, ringPitch: number): void {
    this.begin(this.progPlacido);
    this.gl.uniform2f(this.u("uRange"), 0, 1);
    this.gl.uniform3f(this.u("uPlacido"), camDist, ringDist, ringPitch);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
}
