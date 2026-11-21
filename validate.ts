// 几何验证脚本: node validate.ts
// 对照手算矢高公式, 检查泪膜厚度关键点误差 < 2 um

import { runValidation } from "./src/core/validate.ts";

const rows = runValidation();
let fail = 0;
console.log("点位\t\t\t\t引擎(um)\t手算(um)\t误差(um)\t结果");
for (const r of rows) {
  const ok = r.pass ? "PASS" : "FAIL";
  if (!r.pass) fail++;
  console.log(
    `${r.name.padEnd(24)}\t${r.engine.toFixed(2)}\t\t${r.hand.toFixed(2)}\t\t${r.error.toFixed(3)}\t\t${ok}`,
  );
}
console.log(fail === 0 ? "\n全部通过: 误差均 < 2 um" : `\n${fail} 项超差`);
process.exit(fail === 0 ? 0 : 1);
