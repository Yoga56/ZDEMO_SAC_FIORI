import { connect, call } from "/tmp/arc-call.mjs";
export const P = (id) => ({ id });
const TXT = "fontColor=#1D2D3E;fontFamily=Helvetica;";
export const S = {
  sap: "rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=#EBF8FF;strokeColor=#0070F2;strokeWidth=1.5;verticalAlign=top;align=left;spacingLeft=14;spacingTop=8;fontStyle=1;fontSize=14;" + TXT,
  inner: "rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#0070F2;strokeWidth=1.5;fontSize=13;" + TXT,
  grey: "rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=#F5F6F7;strokeColor=#475E75;strokeWidth=1.5;verticalAlign=top;align=left;spacingLeft=14;spacingTop=8;fontStyle=1;fontSize=14;" + TXT,
  greyIn: "rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#475E75;strokeWidth=1.5;fontSize=13;" + TXT,
  edge: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=blockThin;endFill=1;endSize=4;strokeColor=#475E75;strokeWidth=1.5;fontColor=#556B82;fontSize=12;",
  dash: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=blockThin;endFill=1;endSize=4;strokeColor=#475E75;strokeWidth=1.5;dashed=1;fontColor=#556B82;fontSize=12;",
};
export async function open() {
  const c = await connect();
  const pages = (await call(c, "list-pages", {})).result;
  return { c, pages };
}
export async function box(c, page, style, x, y, w, h, text, parent) {
  const r = await call(c, "add-rectangle", { target_page: P(page), x, y, width: w, height: h, text, style, ...(parent ? { parent_id: parent } : {}) });
  const id = r.result?.id ?? r.id ?? r.result?.cell?.id;
  if (!id) throw new Error("no id: " + JSON.stringify(r).slice(0, 300));
  return id;
}
export async function edge(c, page, a, b, text, style, extra) {
  const r = await call(c, "add-edge", { target_page: P(page), source_id: a, target_id: b, text: text || "", style: (style || S.edge) + (extra || "") });
  if (!r.success) throw new Error(JSON.stringify(r).slice(0, 300));
}
export async function newPage(c, name) {
  const r = await call(c, "create-page", { name });
  return r;
}
export { call } from "/tmp/arc-call.mjs";
