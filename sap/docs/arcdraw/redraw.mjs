import { open, box, edge, call, S, P } from "./lib.mjs";
import fs from "fs";
const OUT = "/Users/alexanderkresnayogatama/Downloads/SAP_BUILD/ZSAC_FIORI/sap/docs/img/diagrams/";
const { c, pages } = await open();
const sub = (s) => s.replace("fontSize=13;", "fontSize=13;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontStyle=1;");
const note = "text;html=1;align=left;fontSize=12;fontColor=#556B82;";
const X = (a, b) => `exitX=${a[0]};exitY=${a[1]};exitDx=0;exitDy=0;entryX=${b[0]};entryY=${b[1]};entryDx=0;entryDy=0;`;
for (const pg of [pages[1], pages[2]]) {
  const m = (await call(c, "list-paged-model", { target_page: P(pg.id) })).result;
  for (const x of m) if (!["0", "1"].includes(x.id) && x.edge) await call(c, "delete-cell-by-id", { target_page: P(pg.id), cell_id: x.id });
  for (const x of m) if (!["0", "1"].includes(x.id) && !x.edge) await call(c, "delete-cell-by-id", { target_page: P(pg.id), cell_id: x.id });
}
{ const p = pages[1].id;
  const src = await box(c, p, S.grey, 40, 60, 260, 420, "Source (any OData V4 entity set)");
  const cds = await box(c, p, S.greyIn, 20, 56, 220, 120, "CDS view<br>e.g. ZI_SAC_GL, ZSALES_CUBE", src);
  await box(c, p, S.greyIn, 20, 220, 220, 100, "Access control<br>(DCL of the user)", src);
  const app = await box(c, p, S.sap, 420, 60, 740, 420, "SAC in Fiori");
  const ls = await box(c, p, S.inner, 20, 56, 230, 120, "LiveSource<br>maps fields to dimensions and measures", app);
  const live = await box(c, p, sub(S.inner), 330, 56, 230, 120, "Live model<br>", app);
  await box(c, p, note, 346, 100, 200, 60, "read only, one version, nothing copied", app);
  const imp = await box(c, p, sub(S.inner), 20, 240, 230, 120, "Import model<br>", app);
  await box(c, p, note, 36, 284, 200, 60, "versions, planning, publish", app);
  const store = await box(c, p, S.inner, 330, 240, 230, 120, "Plan store<br>versions and facts (ZSAC_FACT)", app);
  await edge(c, p, live, ls, "", S.edge, X([0,0.5],[1,0.5]));
  await edge(c, p, ls, cds, "$apply groupby / aggregate", S.edge, X([0,0.5],[1,0.5]));
  await edge(c, p, imp, ls, "reads rows", S.dash, X([0.5,0],[0.5,1]));
  await edge(c, p, imp, store, "Import from Source", S.edge, X([1,0.5],[0,0.5]));
}
{ const p = pages[2].id;
  const gh = await box(c, p, S.grey, 40, 60, 250, 450, "GitHub Yoga56/ZDEMO_SAC_FIORI");
  const g2 = await box(c, p, S.greyIn, 20, 56, 210, 90, "sap/app<br>UI5 library and app", gh);
  const g1 = await box(c, p, S.greyIn, 20, 370, 210, 60, "sap/src<br>ABAP, abapGit format", gh);
  const btp = await box(c, p, S.sap, 400, 60, 330, 280, "SAP BTP, Business Application Studio");
  const d1 = await box(c, p, S.inner, 20, 56, 290, 90, "Dev space<br>ui5 serve, fiori-tools-proxy", btp);
  const d2 = await box(c, p, S.inner, 20, 170, 290, 90, "Destinations my402244, S4_402225_DEV<br>npm run deploy (deploy-to-abap)", btp);
  const adt = await box(c, p, S.grey, 400, 380, 330, 130, "Eclipse ADT");
  const a1 = await box(c, p, S.greyIn, 20, 50, 290, 60, "abapGit pull, activate", adt);
  const sy = await box(c, p, S.grey, 860, 60, 300, 450, "S/4HANA Cloud systems");
  await box(c, p, S.greyIn, 20, 56, 260, 150, "my402244, client 80<br>app, RAP services, seed", sy);
  await box(c, p, S.greyIn, 20, 240, 260, 150, "my402225, client 100<br>app, services, G/L data", sy);
  await edge(c, p, g2, d1, "git pull", S.edge, X([1,0.5],[0,0.5]));
  await edge(c, p, g1, a1, "clone", S.edge, X([1,0.5],[0,0.5]));
  await edge(c, p, d2, sy, "OData V4, deploy", S.edge, X([1,0.5],[0,0.35]));
  await edge(c, p, a1, sy, "pull, activate", S.edge, X([1,0.5],[0,0.85]));
}
for (const [i, n] of [[1, "sources"], [2, "landscape"]]) {
  const s = await call(c, "export-diagram", { target_page: P(pages[i].id), format: "svg", border: 24, transparent: true });
  fs.writeFileSync(OUT + n + ".svg", s.slice(0, s.lastIndexOf("</svg>") + 6));
  console.log(n, (s.match(/Exported svg[^\n]*/)||[""])[0], s.slice(s.lastIndexOf("</svg>")+6));
  console.log(JSON.stringify(await call(c, "check-sap-diagram", { target_page: P(pages[i].id) })).slice(0, 200));
}
await c.close();
