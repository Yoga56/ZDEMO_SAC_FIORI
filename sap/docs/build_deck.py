"""Builds the system design deck twice from one description: PDF (through Chrome) and PPTX (python-pptx)."""
import html, os, sys
W, H = 13.333, 7.5
BLUE, ACC, INK, GREY, LIGHT, GREEN, RED, AMBER = "0A4D8C", "0A6ED1", "1D2D3E", "5A6B7D", "EAF1F8", "107E3E", "B00020", "B25A00"

S = []
def title(t, sub, foot): S.append(dict(k="title", t=t, sub=sub, foot=foot))
def bullets(t, items, lead=None): S.append(dict(k="bullets", t=t, items=items, lead=lead))
def table(t, head, rows, widths, lead=None, size=15): S.append(dict(k="table", t=t, head=head, rows=rows, widths=widths, lead=lead, size=size))
def two(t, lt, li, rt, ri, lc=GREEN, rc=RED, lead=None): S.append(dict(k="two", t=t, lt=lt, li=li, rt=rt, ri=ri, lc=lc, rc=rc, lead=lead))
def image(t, img, cap, lead=None): S.append(dict(k="image", t=t, img=img, cap=cap, lead=lead))
def diagram(t, boxes, arrows, note=None, lead=None): S.append(dict(k="diagram", t=t, boxes=boxes, arrows=arrows, note=note, lead=lead))

# ------------------------------------------------------------------ content
title("Analytics and Planning on Fiori", "System design, and how it compares with SAP Analytics Cloud", "Prepared for Wilmar  |  6 October 2026  |  Status: working on sample data and on a real S/4HANA Cloud system")

bullets("Why this was built", [
 ("Planning and analysis on S/4HANA data today needs a second product (SAC) with its own license, connections, transports and security.", 0),
 ("Question: how much of the SAC working model can run inside the ERP landscape, on the ERP's own authorizations?", 0),
 ("Answer so far: stories, analysis, models, planning with versions, data actions, multi actions, CDS data sources, variance analysis.", 0),
 ("Scope of this deck: the system design, and an honest comparison with the real SAC (advantages and gaps).", 0)])

table("What it does (current release)", ["Area", "Capability"], [
 ["Stories", "Pages, grid designer, charts, KPI, tables, input controls, planning table, action triggers, variance widget"],
 ["Models", "SAC style Modeller: measures, dimensions, hierarchies, Date hierarchy, CSV import, CDS source"],
 ["Planning", "Editable table, spreading, formulas, copy and paste, versions, publish, history, comments on cells"],
 ["Data actions", "Designer, parameters, copy, allocation, scale, delete, embedded action; validate, trace, run history"],
 ["Multi actions", "Parameters, data action, publish, version, lock, CSV import, forecast, API, PaPM hook, comments, source import"],
 ["CDS sources", "Standard or custom CDS view as live (read only) or import source"],
 ["Variance", "Why did a measure change between versions or months, by every dimension, with drill-down"]],
 [2.2, 10.0], size=15)

diagram("System design: the big picture", [
 (0.6, 1.5, 12.1, 0.55, "Browser: UI5 1.136 (Fiori, freestyle app zsac.fiori)", BLUE, "FFFFFF"),
 (0.6, 2.15, 12.1, 1.35, "zsac.lib (reusable UI5 library):  core engines (query, hierarchy, variance)   |   widgets and designer   |   planning (buffer, grid, versions)   |   data actions and multi actions   |   providers", LIGHT, INK),
 (0.6, 3.9, 3.7, 0.9, "MockProvider\nsample data, browser storage", "F5F5F5", INK),
 (4.8, 3.9, 3.9, 0.9, "ODataV4Provider\nmodels, stories, versions, facts, actions", ACC, "FFFFFF"),
 (9.1, 3.9, 3.6, 0.9, "LiveSource\nany CDS view as OData V4", ACC, "FFFFFF"),
 (4.8, 5.3, 3.9, 1.0, "ABAP RAP backend (S/4HANA Cloud)\nservice ZUI_SAC_O4, tables ZSAC_*", BLUE, "FFFFFF"),
 (9.1, 5.3, 3.6, 1.0, "CDS view (standard or custom)\nwrapper view + service binding", BLUE, "FFFFFF")],
 [(2.45, 3.5, 2.45, 3.9), (6.75, 3.5, 6.75, 3.9), (10.9, 3.5, 10.9, 3.9), (6.75, 4.8, 6.75, 5.3), (10.9, 4.8, 10.9, 5.3)],
 note="Pages and widgets only know the DataProvider contract. The browser works on facts; aggregation is one shared engine, so sample data and backend behave the same.")

two("Design principles", "How it is built", [
 "Modular: library zsac.lib is usable by any Fiori app; widgets and data sources are plug-ins registered in one place",
 "Metadata is data: models, stories, actions and files are rows edited by the same UI that shows them",
 "Generic fact table: version, period, measure and five dimension slots, so any model fits one RAP schema",
 "Provider contract: mock for development and tests, OData V4 for the backend, CDS for external data",
 "Generated backend: one description produces CDS, behavior and abapGit files; handlers by hand"],
 "Consequences", [
 "Every feature can be tried and tested without a backend (77 unit tests)",
 "Backend stays small: tables, business objects, two engines, a seed class",
 "Calculations (actions, forecast, variance) run in the browser: easy to change, bounded by browser memory",
 "The ERP stays the system of record for authorization and plan data"],
 lc=ACC, rc=BLUE)

diagram("Data sources: live and import", [
 (0.6, 1.6, 3.0, 1.2, "CDS view\n(standard or custom)\nwrapped, aggregating", LIGHT, INK),
 (4.2, 1.6, 3.0, 1.2, "OData V4 service\nservice definition +\nbinding", LIGHT, INK),
 (7.8, 1.6, 2.2, 1.2, "LiveSource\nmapping, $apply", ACC, "FFFFFF"),
 (10.6, 0.95, 2.1, 1.0, "LIVE model\nread only, one version", BLUE, "FFFFFF"),
 (10.6, 2.45, 2.1, 1.0, "IMPORT model\nversions, planning", BLUE, "FFFFFF"),
 (7.8, 4.4, 4.9, 1.0, "Multi action step 'Import from Source' or Modeller button: months, replace or update", LIGHT, INK)],
 [(3.6, 2.2, 4.2, 2.2), (7.2, 2.2, 7.8, 2.2), (10.0, 2.0, 10.6, 1.45), (10.0, 2.4, 10.6, 2.95), (11.65, 3.45, 11.65, 4.4)],
 note="The service aggregates (groupby, aggregate); if it cannot, the app reads the rows and aggregates itself. Access control of the CDS view applies to the user who reads. Tested on a G/L view with 1,092 rows, two currencies.")

table("Backend (ABAP RAP) at a glance", ["Part", "Design"], [
 ["Tables", "ZSAC_FILE, STORY, WIDGET, MODEL, DIM, MEASURE, VERSION, FACT, DATAACT, DASTEP, MULTIACT, MASTEP, RUN, COMMENT, CALTASK"],
 ["Business objects", "Managed RAP, strict(2), no draft; compositions Story-Widget, Model-Dim/Measure, Action-Step; one request writes root and children"],
 ["Actions", "Version: create private, publish, revert. Fact: bulk write and delete"],
 ["Rules on the server", "Locked versions are not written; model structure checked on save; keys given by the caller"],
 ["Generated", "sap_spec.py to CDS, behavior, projections, service definition, abapGit metadata"],
 ["Service", "ZUI_SAC_O4 (OData V4 UI); UI5 app deployed as ZSAC_FIORI; launchpad descriptor after deployment"]],
 [2.4, 9.8], size=15)

diagram("Landscape and delivery", [
 (0.6, 1.5, 3.0, 1.0, "GitHub\nZDEMO_SAC_FIORI", LIGHT, INK),
 (4.3, 1.5, 3.4, 1.0, "ADT + abapGit\npull, activate, seed", ACC, "FFFFFF"),
 (8.4, 1.5, 4.3, 1.0, "S/4HANA Cloud (client 100)\nRAP service, CDS views, IAM apps", BLUE, "FFFFFF"),
 (4.3, 3.6, 3.4, 1.0, "Business Application Studio\nnpm start / deploy", ACC, "FFFFFF"),
 (8.4, 3.6, 4.3, 1.0, "BTP destination\nproxy to the S/4 system", LIGHT, INK),
 (0.6, 3.6, 3.0, 1.0, "Browser / Launchpad\nuser session", LIGHT, INK)],
 [(3.6, 2.0, 4.3, 2.0), (7.7, 2.0, 8.4, 2.0), (5.95, 2.5, 5.95, 3.6), (7.7, 4.1, 8.4, 4.1), (10.55, 3.6, 10.55, 2.5), (4.3, 4.1, 3.6, 4.1)],
 note="Same code for mock, BAS test and deployment. A relative service URL lets the proxy or the launchpad add host and login. Where abapGit is not available the ABAP is entered by hand (a short list of changes).")

two("Security and operations", "In place", [
 "Calls run under the user's own session; CDS access control applies to live and import reads",
 "Custom services need an IAM app, business catalog and role (S/4HANA Cloud public edition)",
 "Locked versions refuse writes on the server and in every engine",
 "Every action run is recorded (status, counts, duration, user, parameters)",
 "Data audit and comments carry user and time from the backend"],
 "Not in place yet", [
 "No owner or sharing rules for stories and models (open to all users of the service)",
 "No row level security on plan data (only on CDS source reads)",
 "No server job: actions run in the browser of the user",
 "No transport of content except through abapGit and the seed",
 "API step runs from the browser: no stored credentials, CORS applies"],
 lc=GREEN, rc=AMBER)

image("Stories: charts, KPIs, input controls", "03-story-overview.png", "Story viewer on the sample data")
image("Planning: edit, spread, comment, publish", "06-planning-story.png", "Editable planning table; the orange corner marks a cell with a comment")
image("Data actions: designer with step flow", "11-data-action-designer.png", "Step flow on the left, step editor on the right; validate, trace and run on the toolbar")
image("Variance explainer: why did it change?", "05-variance-explainer.png", "Headline, named drivers, ranked dimensions, bars to drill into")

table("Tested on the real system (S/4HANA Cloud, OData V4)", ["Feature", "Result"], [
 ["Backend reads, live CDS model, story with filters", "Works"],
 ["Save model (deep insert), versions, import of 1,092 values", "Works"],
 ["Lock and unlock (PATCH), data kept", "Works"],
 ["Data action with parameters: dry run and run (329 facts)", "Works, result checked"],
 ["Multi action: data action, lock, forecast, comments, source import, CSV import", "Works (8 steps, 85 s)"],
 ["Planning edit and publish, cell comments, variance explainer", "Works"],
 ["Create private version (server action)", "Fails until two ABAP lines are changed by hand"],
 ["API and PaPM steps", "As designed: target 401 reported, PaPM not connected"]],
 [8.6, 3.6], size=15)

table("Versus real SAC: capability", ["Capability", "This app", "SAC"], [
 ["Stories, analysis, models, hierarchies", "Core set", "Complete, mature"],
 ["Planning with versions, publish, history", "Yes", "Yes, plus workflows and calendar approvals"],
 ["Data actions", "Copy, allocate, scale, delete, embed, parameters", "Plus advanced formulas, currency conversion, cross-model"],
 ["Multi actions", "10 step types", "Similar, more connectors"],
 ["Predictive / ML, Smart Insights", "Statistical forecast, variance explainer", "Smart Predict, Smart Insights, Just Ask"],
 ["Scripting, custom widgets", "Widget registry in code", "Analytics Designer scripting"],
 ["Mobile, Excel add-in, subscriptions", "No", "Yes"],
 ["Data connections", "CDS via OData V4", "Live and import, many sources incl. BW, S/4"],
 ["Scale", "Browser memory bound", "Server side, large volumes"]],
 [3.9, 4.2, 4.1], size=13)

two("Advantages over using real SAC", "Pros", [
 "No extra product, license or tenant: runs in the S/4HANA landscape and the Fiori launchpad",
 "One security model: the user's CDS access control, no gateway, SSO setup or connection admin",
 "Plan data lives in the ERP (RAP tables): no replication, same transport and backup path, close to the source",
 "Open and changeable: every step, widget and rule can be adapted in code in days",
 "Tailored features: CDS live and import, variance explainer, multi action steps built for this use",
 "Modular library reusable in other Fiori apps; sample mode for training and tests"],
 "Cons: gaps compared with SAC", [
 "Far narrower scope: no Smart Predict, Smart Insights, Just Ask, mobile app, Excel add-in, subscriptions",
 "Calculations run in the browser: large models and long multi actions are slow (85 s for 8 steps on 1,092 rows)",
 "Owned code: we maintain it, no SAP support or release roadmap, UI5 and RAP upgrades are our work",
 "Security and governance are basic: no sharing rules, no row level plan security, no content transport",
 "Planning depth is smaller: no workflows or approvals, no advanced formulas, no currency conversion",
 "Only validated on one system; ABAP needed hand fixes on a system without abapGit"],
 lc=GREEN, rc=RED)

two("When to use which", "Use this app when", [
 "The data is in S/4HANA CDS views and the planning is modest: versions, allocations, forecasts",
 "A second product or license is not wanted, or data may not leave the ERP",
 "Users are already in Fiori and need a few tailored dashboards and plan tables",
 "A fast, customizable pilot is wanted before a larger tool decision"],
 "Use real SAC when", [
 "Enterprise planning: workflows, approvals, many users, large data volumes",
 "Many source systems (BW, non-SAP) are combined",
 "Advanced analytics, predictive, natural language, mobile and Excel are required",
 "SAP support, content governance and a product roadmap are required"],
 lc=ACC, rc=BLUE)

bullets("Status and next steps", [
 ("Status: complete feature set on the sample data; verified on a real system except one ABAP fix (private versions).", 0),
 ("1. Apply the ABAP fix on the system without abapGit, then test publish, revert, delete of private versions.", 0),
 ("2. Decide the owner and sharing model (who sees which story and model) and add authorization.", 0),
 ("3. Measure with realistic volume (CDS rows, facts per version) and decide whether actions need a server job.", 0),
 ("4. Pilot with one finance team on the G/L model: live analysis first, then import and a budget version.", 0),
 ("5. Decide against SAC with the pilot results: which gaps matter to the users.", 0)])

# ------------------------------------------------------------------ HTML / PDF
def esc(s): return html.escape(s).replace("\n", "<br>")
css = f"""@page {{ size: {W}in {H}in; margin: 0; }} * {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #{INK}; }}
.s {{ position: relative; width: {W}in; height: {H}in; overflow: hidden; page-break-after: always; background: #fff; }}
.bar {{ position: absolute; left: 0; top: 0; width: {W}in; height: 1.05in; background: #{BLUE}; }}
.bar h1 {{ margin: 0; color: #fff; font-size: 28pt; font-weight: 600; position: absolute; left: 0.6in; top: 0.27in; }}
.num {{ position: absolute; right: 0.4in; bottom: 0.2in; color: #{GREY}; font-size: 10pt; }}
.abs {{ position: absolute; }}
ul {{ margin: 0; padding-left: 0.28in; }} li {{ margin: 0 0 0.14in; }}
table {{ border-collapse: collapse; position: absolute; left: 0.6in; top: 1.45in; }}
th {{ background: #{BLUE}; color: #fff; text-align: left; padding: 7px 10px; }} td {{ border-bottom: 1px solid #c9d3de; padding: 7px 10px; vertical-align: top; }}
.box {{ position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; border-radius: 8px; padding: 6px; font-size: 13pt; line-height: 1.25; border: 1px solid #b6c4d3; }}
.col h2 {{ margin: 0 0 12px; font-size: 20pt; }} .col {{ position: absolute; top: 1.45in; width: 5.95in; font-size: 14pt; }}
.cover {{ background: #{BLUE}; color: #fff; }}
"""
def render_html():
    out = [f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>"]
    n = 0
    for s in S:
        n += 1
        k = s["k"]
        if k == "title":
            out.append(f"<div class='s cover'><div class='abs' style='left:0.9in;top:2.4in;width:11.5in'><div style='font-size:42pt;font-weight:600'>{esc(s['t'])}</div><div style='font-size:20pt;margin-top:14px;opacity:.9'>{esc(s['sub'])}</div></div><div class='abs' style='left:0.9in;bottom:0.7in;font-size:13pt;opacity:.85'>{esc(s['foot'])}</div></div>")
            continue
        body = ""
        if k == "bullets":
            body = "<div class='abs' style='left:0.7in;top:1.5in;width:11.9in;font-size:19pt;line-height:1.35'><ul>" + "".join(f"<li>{esc(t)}</li>" for t, _ in s["items"]) + "</ul></div>"
        elif k == "table":
            ws = s["widths"]
            head = "<tr>" + "".join(f"<th style='width:{w}in'>{esc(h)}</th>" for h, w in zip(s["head"], ws)) + "</tr>"
            rows = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in s["rows"])
            body = f"<table style='font-size:{s['size']+1}pt;width:{sum(ws)}in'>{head}{rows}</table>"
        elif k == "two":
            def col(x, title_, items, color):
                return f"<div class='col' style='left:{x}in'><h2 style='color:#{color}'>{esc(title_)}</h2><ul style='font-size:15.5pt'>" + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul></div>"
            body = col(0.6, s["lt"], s["li"], s["lc"]) + col(6.8, s["rt"], s["ri"], s["rc"])
        elif k == "image":
            body = f"<img src='img/{s['img']}' class='abs' style='left:1.6in;top:1.3in;height:5.5in;border:1px solid #c9d3de;border-radius:4px'><div class='abs' style='left:0;width:{W}in;top:6.9in;text-align:center;color:#{GREY};font-size:12pt'>{esc(s['cap'])}</div>"
        elif k == "diagram":
            body = ""
            for (x, y, w, h, t, fill, fg) in s["boxes"]:
                body += f"<div class='box' style='left:{x}in;top:{y}in;width:{w}in;height:{h}in;background:#{fill};color:#{fg}'>{esc(t)}</div>"
            body += f"<svg class='abs' style='left:0;top:0' width='{W}in' height='{H}in' viewBox='0 0 {W} {H}'><defs><marker id='a' markerWidth='8' markerHeight='8' refX='7' refY='4' orient='auto'><path d='M0,0 L8,4 L0,8 z' fill='#{GREY}'/></marker></defs>"
            for (x1, y1, x2, y2) in s["arrows"]:
                body += f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' stroke='#{GREY}' stroke-width='0.03' marker-end='url(#a)'/>"
            body += "</svg>"
            if s["note"]:
                body += f"<div class='abs' style='left:0.6in;top:6.55in;width:12.1in;font-size:12pt;color:#{GREY}'>{esc(s['note'])}</div>"
        out.append(f"<div class='s'><div class='bar'><h1>{esc(s['t'])}</h1></div>{body}<div class='num'>{n}</div></div>")
    out.append("</body></html>")
    return "".join(out)

# ------------------------------------------------------------------ PPTX
def render_pptx(path):
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
    rgb = lambda h: RGBColor.from_string(h)
    prs = Presentation(); prs.slide_width = Inches(W); prs.slide_height = Inches(H)
    blank = prs.slide_layouts[6]
    def text(sl, x, y, w, h, t, size, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
        tb = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
        for i, line in enumerate(t.split("\n")):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); p.alignment = align
            r = p.add_run(); r.text = line; r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = rgb(color)
        return tb
    def bulletlist(sl, x, y, w, h, items, size):
        tb = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame; tf.word_wrap = True
        for i, t in enumerate(items):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); p.space_after = Pt(size * 0.7)
            r = p.add_run(); r.text = "•  " + t; r.font.size = Pt(size); r.font.color.rgb = rgb(INK)
    n = 0
    for s in S:
        n += 1; sl = prs.slides.add_slide(blank); k = s["k"]
        if k == "title":
            bg = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height); bg.fill.solid(); bg.fill.fore_color.rgb = rgb(BLUE); bg.line.fill.background()
            text(sl, 0.9, 2.3, 11.5, 1.3, s["t"], 40, "FFFFFF", True)
            text(sl, 0.9, 3.6, 11.5, 1.0, s["sub"], 20, "FFFFFF")
            text(sl, 0.9, 6.5, 11.5, 0.6, s["foot"], 12, "DCE7F3")
            continue
        bar = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(1.05)); bar.fill.solid(); bar.fill.fore_color.rgb = rgb(BLUE); bar.line.fill.background()
        text(sl, 0.6, 0.2, 12.1, 0.7, s["t"], 26, "FFFFFF", True, anchor=MSO_ANCHOR.MIDDLE)
        text(sl, 12.4, 7.05, 0.7, 0.3, str(n), 10, GREY, align=PP_ALIGN.RIGHT)
        if k == "bullets":
            bulletlist(sl, 0.7, 1.5, 11.9, 5.2, [t for t, _ in s["items"]], 18)
        elif k == "table":
            ws = s["widths"]; rows = len(s["rows"]) + 1
            gs = sl.shapes.add_table(rows, len(ws), Inches(0.6), Inches(1.45), Inches(sum(ws)), Inches(0.5 * rows)); tbl = gs.table
            for ci, w in enumerate(ws): tbl.columns[ci].width = Inches(w)
            def cell(c, t, bold=False, fill=None, color=INK):
                c.text = ""; p = c.text_frame.paragraphs[0]; r = p.add_run(); r.text = t; r.font.size = Pt(s["size"]); r.font.bold = bold; r.font.color.rgb = rgb(color)
                c.text_frame.word_wrap = True
                if fill: c.fill.solid(); c.fill.fore_color.rgb = rgb(fill)
                else: c.fill.solid(); c.fill.fore_color.rgb = rgb("FFFFFF")
            for ci, h in enumerate(s["head"]): cell(tbl.cell(0, ci), h, True, BLUE, "FFFFFF")
            for ri, r in enumerate(s["rows"]):
                for ci, c in enumerate(r): cell(tbl.cell(ri + 1, ci), c, fill=("F4F8FC" if ri % 2 else None))
        elif k == "two":
            for x, ttl, items, color in ((0.6, s["lt"], s["li"], s["lc"]), (6.8, s["rt"], s["ri"], s["rc"])):
                text(sl, x, 1.4, 5.95, 0.5, ttl, 18, color, True)
                bulletlist(sl, x, 1.95, 5.95, 5.0, items, 15)
        elif k == "image":
            from PIL import Image
            iw, ih = Image.open(os.path.join("img", s["img"])).size; hh = 5.4; ww = hh * iw / ih
            sl.shapes.add_picture(os.path.join("img", s["img"]), Inches((W - ww) / 2), Inches(1.3), Inches(ww), Inches(hh))
            text(sl, 0, 6.85, W, 0.4, s["cap"], 12, GREY, align=PP_ALIGN.CENTER)
        elif k == "diagram":
            for (x, y, w, h, t, fill, fg) in s["boxes"]:
                b = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h)); b.fill.solid(); b.fill.fore_color.rgb = rgb(fill); b.line.color.rgb = rgb("B6C4D3")
                tf = b.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
                for i, line in enumerate(t.split("\n")):
                    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); p.alignment = PP_ALIGN.CENTER
                    r = p.add_run(); r.text = line; r.font.size = Pt(12); r.font.color.rgb = rgb(fg); r.font.bold = (i == 0)
            for (x1, y1, x2, y2) in s["arrows"]:
                c = sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2)); c.line.color.rgb = rgb(GREY); c.line.width = Pt(1.75)
                ln = c.line._get_or_add_ln(); from lxml import etree
                tail = etree.SubElement(ln, "{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd"); tail.set("type", "triangle")
            if s["note"]: text(sl, 0.6, 6.5, 12.1, 0.7, s["note"], 12, GREY)
    prs.save(path)

if __name__ == "__main__":
    open("SAC_Fiori_System_Design.html", "w", encoding="utf-8").write(render_html())
    if "--pptx" in sys.argv: render_pptx("SAC_Fiori_System_Design.pptx")
    print(len(S), "slides")
