import { open, box, edge, call, S, P } from "./lib.mjs";
import fs from "fs";
const OUT = "/Users/alexanderkresnayogatama/Downloads/SAP_BUILD/ZSAC_FIORI/sap/docs/img/diagrams/";
const { c, pages } = await open();
// reset page 0
const p0 = pages[0].id;
const model = (await call(c, "list-paged-model", { target_page: P(p0) })).result;
for (const m of model) if (!["0", "1"].includes(m.id)) await call(c, "delete-cell-by-id", { target_page: P(p0), id: m.id });
await call(c, "rename-page", { target_page: P(p0), name: "architecture" });
let p1 = pages[1]?.id; if (!p1) p1 = (await call(c, "create-page", { name: "sources" })).result.id; else await call(c, "rename-page", { target_page: P(p1), name: "sources" });
let p2 = pages[2]?.id; if (!p2) p2 = (await call(c, "create-page", { name: "landscape" })).result.id;
const white = S.inner.replace("fillColor=#FFFFFF", "fillColor=#FFFFFF") + "verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontStyle=1;";
const sub = (s) => s.replace("fontSize=13;", "fontSize=13;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontStyle=1;");

// ---- 1 architecture
{
  const p = p0;
  const users = await box(c, p, S.grey, 40, 140, 190, 300, "Users");
  const u1 = await box(c, p, S.greyIn, 20, 56, 150, 90, "Planner and analyst<br>(Fiori launchpad)", users);
  const u2 = await box(c, p, S.greyIn, 20, 170, 150, 90, "Developer<br>(BAS, ADT)", users);
  const mock = await box(c, p, S.grey, 40, 500, 190, 110, "Local only");
  const mk = await box(c, p, S.greyIn, 20, 46, 150, 50, "MockProvider (JSON)", mock);
  const btp = await box(c, p, S.sap, 290, 40, 960, 620, "SAP S/4HANA Cloud, ABAP environment");
  const fe = await box(c, p, sub(S.inner), 20, 56, 270, 530, "Front end (UI5)", btp);
  const app = await box(c, p, S.inner, 20, 56, 230, 110, "zsac.fiori<br>shell, routes, designers", fe);
  const lib = await box(c, p, S.inner, 20, 190, 230, 150, "zsac.lib<br>widgets, query, variance,<br>planning, data actions", fe);
  const prov = await box(c, p, S.inner, 20, 364, 230, 130, "DataProvider contract<br>Mock | OData V4", fe);
  const svc = await box(c, p, sub(S.inner), 330, 56, 270, 530, "OData V4 services", btp);
  const s1 = await box(c, p, S.inner, 20, 56, 230, 190, "ZUI_SAC_O4<br>models, stories, versions,<br>plan data, actions", svc);
  const s2 = await box(c, p, S.inner, 20, 290, 230, 190, "ZUI_SAC_GL<br>G/L live read (entity SAC_GL_PERIOD)", svc);
  const bo = await box(c, p, sub(S.inner), 640, 56, 290, 250, "RAP business objects", btp);
  const b1 = await box(c, p, S.inner, 20, 56, 250, 70, "ZR_SAC_* managed, strict(2)", bo);
  const b2 = await box(c, p, S.inner, 20, 146, 250, 80, "Fact writer, engines,<br>comment and lock checks", bo);
  const st = await box(c, p, sub(S.inner), 640, 340, 290, 246, "Data", btp);
  const t1 = await box(c, p, S.inner, 20, 56, 250, 70, "ZSAC_* tables<br>plan facts, metadata", st);
  const t2 = await box(c, p, S.inner, 20, 146, 250, 80, "CDS views (ZI_SAC_GL, ZSALES_CUBE)<br>live and import sources", st);
  await edge(c, p, u1, app, "HTTPS");
  await edge(c, p, app, lib);
  await edge(c, p, lib, prov);
  await edge(c, p, prov, s1, "OData V4");
  await edge(c, p, prov, s2, "OData V4 + $apply");
  await edge(c, p, s1, b1);
  await edge(c, p, b1, b2);
  await edge(c, p, b2, t1);
  await edge(c, p, s2, t2);
  await edge(c, p, mk, prov, "?provider=mock", S.dash);
  await edge(c, p, u2, app, "deploy", S.dash);
}
// ---- 2 data sources
{
  const p = p1;
  const src = await box(c, p, S.grey, 40, 60, 260, 440, "Source (any OData V4 entity set)");
  const cds = await box(c, p, S.greyIn, 20, 56, 220, 120, "CDS view<br>e.g. ZI_SAC_GL,<br>ZSALES_CUBE", src);
  const acl = await box(c, p, S.greyIn, 20, 200, 220, 100, "Access control<br>(DCL of the user)", src);
  const app = await box(c, p, S.sap, 400, 60, 760, 440, "SAC in Fiori");
  const ls = await box(c, p, S.inner, 20, 56, 230, 150, "LiveSource<br>maps fields to dimensions<br>and measures", app);
  const live = await box(c, p, sub(S.inner), 300, 56, 200, 150, "Live model", app);
  const imp = await box(c, p, sub(S.inner), 300, 240, 200, 150, "Import model", app);
  const eng = await box(c, p, S.inner, 20, 240, 230, 150, "Query engine, variance,<br>stories and tables", app);
  const store = await box(c, p, S.inner, 540, 240, 200, 150, "Plan store<br>versions and facts (ZSAC_FACT)", app);
  const txtlive = await box(c, p, "text;html=1;align=left;fontSize=12;fontColor=#556B82;", 316, 100, 170, 50, "read only, one version, no copy", app);
  const txtimp = await box(c, p, "text;html=1;align=left;fontSize=12;fontColor=#556B82;", 316, 284, 170, 50, "versions, planning, publish", app);
  await edge(c, p, live, ls, "", S.edge);
  await edge(c, p, ls, cds, "$apply groupby/aggregate", S.edge);
  await edge(c, p, imp, ls, "", S.dash);
  await edge(c, p, ls, eng, "", S.edge, "exitX=0.5;exitY=1;entryX=0.5;entryY=0;");
  await edge(c, p, imp, store, "Import from Source step", S.edge);
  await edge(c, p, store, eng, "", S.dash);
}
// ---- 3 landscape
{
  const p = p2;
  const gh = await box(c, p, S.grey, 40, 60, 250, 250, "GitHub Yoga56/ZDEMO_SAC_FIORI");
  const g1 = await box(c, p, S.greyIn, 20, 56, 210, 70, "sap/src<br>ABAP in abapGit format", gh);
  const g2 = await box(c, p, S.greyIn, 20, 146, 210, 70, "sap/app<br>UI5 library and app", gh);
  const adt = await box(c, p, S.grey, 40, 380, 250, 130, "Eclipse ADT");
  const a1 = await box(c, p, S.greyIn, 20, 50, 210, 60, "abapGit pull, activate", adt);
  const btp = await box(c, p, S.sap, 400, 60, 330, 450, "SAP BTP, Business Application Studio");
  const d1 = await box(c, p, S.inner, 20, 56, 290, 110, "Dev space<br>ui5 serve, fiori-tools-proxy", btp);
  const d2 = await box(c, p, S.inner, 20, 190, 290, 110, "Destinations<br>my402244, S4_402225_DEV", btp);
  const d3 = await box(c, p, S.inner, 20, 324, 290, 90, "deploy-to-abap<br>(npm run deploy)", btp);
  const s1 = await box(c, p, S.grey, 860, 60, 300, 200, "S/4HANA Cloud my402244");
  const s1i = await box(c, p, S.greyIn, 20, 56, 260, 110, "Client 80<br>app, RAP services, seed", s1);
  const s2 = await box(c, p, S.grey, 860, 310, 300, 200, "S/4HANA Cloud my402225");
  const s2i = await box(c, p, S.greyIn, 20, 56, 260, 110, "Client 100<br>app, services, G/L data", s2);
  await edge(c, p, g2, d1, "git pull");
  await edge(c, p, g1, a1, "clone", S.edge, "exitX=0.5;exitY=1;entryX=0.5;entryY=0;");
  await edge(c, p, a1, s1i, "pull", S.edge);
  await edge(c, p, d2, s1i, "OData V4", S.edge);
  await edge(c, p, d2, s2i, "OData V4", S.edge);
  await edge(c, p, d3, s2i, "ABAP repository", S.dash);
}
for (const [id, name] of [[p0, "architecture"], [p1, "sources"], [p2, "landscape"]]) {
  const chk = await call(c, "check-sap-diagram", { target_page: P(id) });
  console.log(name, JSON.stringify(chk).slice(0, 700));
}
await c.close();
