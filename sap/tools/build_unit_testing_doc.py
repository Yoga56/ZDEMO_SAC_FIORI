"""Builds sap/docs/SAC_Fiori_Unit_Testing.docx (needs python-docx: python3 -m venv v; v/bin/pip install python-docx).
Run from sap/:  python3 tools/build_unit_testing_doc.py

The test counts are read from sap/app/saclib/test/node/*.test.js, so the document follows the tests."""
import glob
import os
import re
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
TESTS = os.path.join(HERE, "..", "app", "saclib", "test", "node")

# what each file covers: (area, what is checked)
AREAS = {
    "access": ("Sharing", "Access level of a user: owner, shared with a user, with everyone, no access, objects without an owner"),
    "bookmarks": ("Story", "Saved views of a story: save, replace by name, rename, default, remove"),
    "calcmeasures": ("Analyser", "Calculated measures worked out per cell on aggregated numbers"),
    "calendar": ("Calendar", "Dates without time zones, month ends, task scheduling, reminders, links between tasks, review and approval"),
    "cds": ("Live data", "Live and import sources on CDS views: period formats, query text, definition checks"),
    "chart": ("Charts", "Waterfall: steps, running total and the last total bar"),
    "chart2": ("Charts", "Treemap: areas proportional to values, filling the box, staying inside it"),
    "chart3": ("Charts", "Smooth curves pass through the points and do not overshoot"),
    "compass": ("Compass", "Tree syntax with range, percent and distribution; simulation of the uncertainty of drivers"),
    "compassview": ("Compass", "Compass chart: area per case, bounds, baseline and curve"),
    "dataaction": ("Data actions", "Copy rules (version and year shift, parameter in the filter, factor, overwrite, append), allocation, formulas, delete"),
    "engines": ("Engines", "Aggregation ordered by master data, totals, filters, pivot"),
    "gridview": ("Planning", "Saved table views: normalising and dropping what makes no sense"),
    "hierarchy": ("Planning", "Hierarchies: depth first order, depth, ancestors, unplaced members become roots"),
    "history": ("Modeller", "Undo and redo of changes; a new change drops what could be redone"),
    "locking": ("Planning", "Data Locking regions: quarter or node stands for everything below, strictest rule wins, owners of a restricted region"),
    "mockprovider": ("Providers", "Mock provider: queries, versions, writes"),
    "model": ("Modeller", "Measure aggregation (SUM, AVG, MIN, MAX, COUNT) and model rules"),
    "multiaction": ("Multi actions", "Validation and running of the seeded multi action, step types"),
    "odata-save": ("Providers", "OData provider: PATCH of the fields, children replaced, the object is never deleted on save"),
    "planning": ("Planning", "Date hierarchy, filters on a year select its months, spreading, cell edits, publish"),
    "resize": ("App shell", "Resizing of the side panels stays within limits"),
    "sharing": ("Sharing", "A new story belongs to its author; shares, lists and opening, the provider refuses what a user may not do; deleting an object deletes its shares"),
    "steps": ("Data and multi actions", "Step types: CSV import (delimiter, quotes, empty lines), API, comment management, predictive, import"),
    "storylayout": ("Story", "Story grid: drag, push down, tidy up (compact), resize from any edge or corner"),
    "valuetree": ("Widgets", "Value driver tree: parse, ids, operators and leaf specifications"),
    "variance": ("Widgets", "Variance explainer: totals, shares add up, members ranked by size of the change"),
    "webcontent": ("Widgets", "Web content: http(s), paths and small pictures pass; script and file schemes never do"),
    "widgets3": ("Widgets", "Button action: only listed actions with checked targets"),
}


def count_tests():
    rows = []
    for f in sorted(glob.glob(os.path.join(TESTS, "*.test.js"))):
        name = os.path.basename(f)[: -len(".test.js")]
        n = len(re.findall(r"^test\(", open(f, encoding="utf-8").read(), flags=re.M))
        area, what = AREAS.get(name, ("", ""))
        rows.append((name + ".test.js", area, n, what))
    return rows


def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    tcPr.append(shd)


def table(doc, head, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(head))
    t.style = "Table Grid"
    for i, h in enumerate(head):
        c = t.rows[0].cells[i]
        c.text = ""
        r = c.paragraphs[0].add_run(h)
        r.bold = True
        r.font.size = Pt(9.5)
        shade(c, "E8F0F8")
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(v))
            r.font.size = Pt(9)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Pt(w)
    doc.add_paragraph()
    return t


def code(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.name = "Menlo"
    r.font.size = Pt(8.5)
    p.paragraph_format.left_indent = Pt(12)
    return p


def build():
    rows = count_tests()
    total = sum(r[2] for r in rows)
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10.5)

    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = t.add_run("Unit Testing")
    r.bold = True
    r.font.size = Pt(28)
    r.font.color.rgb = RGBColor(0x0A, 0x4D, 0x8C)
    s = doc.add_paragraph()
    r = s.add_run("Analytics and Planning on Fiori (zsac.lib and zsac.fiori): automated tests, end-to-end checks and how to extend them")
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(0x4A, 0x5D, 0x70)

    doc.add_heading("1. Summary", 1)
    doc.add_paragraph(
        f"The UI5 library zsac.lib has {total} automated unit tests in {len(rows)} files. They run in Node.js in under a second, need no browser, "
        "no UI5 runtime and no backend, and all of them pass. They test the logic (engines, schemas, access rules, providers, layout maths); "
        "what the user sees and the ABAP backend are tested by hand on the deployed app (chapter 6). There are no ABAP unit tests yet."
    )
    table(doc, ["Item", "Value"], [
        ["Test runner", "node --test (built in; written with Node 24, any current Node should do)"],
        ["Location", "sap/app/saclib/test/node/*.test.js"],
        ["Command", "npm test (in sap/app/saclib)"],
        ["Tests", f"{total}, all passing"],
        ["Run time", "about 1 second"],
        ["Not covered by unit tests", "UI5 controls and views, CSS, the ABAP backend (checked by hand, chapter 6)"],
    ], [150, 330])

    doc.add_heading("2. How to run", 1)
    code(doc, "cd sap/app/saclib\nnpm test")
    doc.add_paragraph("A single file, or a single test by name:")
    code(doc, "node --test test/node/storylayout.test.js\nnode --test --test-name-pattern=\"tidy up\" test/node/*.test.js")
    doc.add_paragraph("Output: one line per test with the duration, then a summary with the number of passed and failed tests. A failing test prints the expected and the actual value. The command exits with a non-zero code when a test fails, so it can run in a pipeline.")

    doc.add_heading("3. How the tests are built", 1)
    doc.add_paragraph(
        "The modules of zsac.lib are written with sap.ui.define. Test code cannot load them without UI5, so test/node/loader.js provides a minimal sap.ui.define and sap.ui.require: "
        "it resolves zsac/lib/... to the files under src, loads the dependencies and caches the modules. A test loads a module like this:"
    )
    code(doc, "const req = require(\"./loader\");\nconst StorySchema = req(\"zsac/lib/core/StorySchema\");")
    doc.add_paragraph(
        "Only modules without UI5 controls can be loaded this way, which is why the logic was kept apart from the controls: StorySchema, FilterEngine and the engines, the providers (the OData provider is tested with a stub model, only its request layer), "
        "Access, LockEngine, CalendarEngine, the chart geometry in ChartBuilders and the step runners. A test may replace a UI5 module that is not part of the library by setting globalThis.__sapStubs."
    )
    doc.add_paragraph("Conventions used in the tests:")
    for b in [
        "One test checks one rule and is named like the rule (\"tidy up: widgets move up until something is in the way\"), so a failure reads as a sentence.",
        "Test data is built in the test (small helper functions such as w(id, X, Y, W, H)); the files in sap/mock are used only by the mock provider tests.",
        "Use fixed date strings, not the current date, so that a test gives the same result every day.",
        "Asynchronous provider tests use async functions and await.",
        "For a bug found by hand, write the test first (it fails), then fix it (it passes).",
    ]:
        doc.add_paragraph(b, style="List Bullet")

    doc.add_heading("4. Coverage by area", 1)
    doc.add_paragraph("The number is the number of tests in the file.")
    table(doc, ["File", "Area", "Tests", "What is checked"], [(a, b, c, d) for a, b, c, d in rows], [95, 70, 35, 280])
    areas = {}
    for _, area, n, _ in rows:
        areas[area] = areas.get(area, 0) + n
    doc.add_paragraph("Tests per area:")
    table(doc, ["Area", "Tests"], sorted(areas.items(), key=lambda kv: -kv[1]), [250, 60])

    doc.add_heading("5. Rules the tests protect", 1)
    for b in [
        "Sharing and access: the access level of a user is owner, edit, view or none; content without an owner is open to everyone; a user who may only view cannot change or delete; deleting an object deletes its shares.",
        "Planning: typing into a locked cell is refused with the reason; a spread over a total needs every value open; a write into a locked region fails as a whole, private versions are not locked and publish respects the lock; validation rules (minimum, maximum, error or warning) refuse or warn; spreading rounds to the largest and the buffer supports undo and redo.",
        "Data locking regions: a quarter or a hierarchy node in a region stands for everything below it; the strictest region wins; the model default applies outside every region.",
        "Data actions: copy with version and year shift, parameters in filters, factor, overwrite or append; allocation (equal, proportional, reference version), scale, delete, currency conversion with rates and advanced formulas; a locked version stops the whole run.",
        "OData provider: saving an existing object sends PATCH for the fields and replaces the children, it never deletes the object (a former bug that lost data).",
        "Story layout: a dropped or resized widget keeps its place and pushes the widgets it lands on down; Tidy up closes gaps without overlaps; resizing from any edge or corner stays inside the 12 column grid and above the minimum size.",
        "Charts: treemap areas are proportional, curves do not overshoot, waterfall ends with the total.",
        "Web content: only http(s), relative paths and small pictures; script and file schemes are never shown.",
    ]:
        doc.add_paragraph(b, style="List Bullet")

    doc.add_heading("6. End-to-end checks on the real system", 1)
    doc.add_paragraph(
        "The deployed app (S/4HANA Cloud, client 100, launchpad tile) was tested by hand, page by page, with two accounts: the owner in one browser window and a second user in a private window. "
        "Screenshots were taken for every page. The objects created for the test are kept on the system as history data. The table gives the result per area; chapter 10 of the main documentation lists the bugs."
    )
    table(doc, ["Area", "Checked", "Result"], [
        ["Home, Files", "Tiles, catalogue, favourites, shared with me, folders", "Pass"],
        ["Stories", "Create, edit, save, publish, duplicate, pages, filters, all widget types on live CDS models", "Pass after fixes"],
        ["Data Analyser", "Builder, result, input control filter, CSV and Excel export", "Pass after fixes"],
        ["Datasets, Modeller", "Create, currency and unit, refresh, delete with cascade", "Pass after fixes"],
        ["Planning", "Private version, cell edit, spread, comments, publish, revert, locking, CSV export, chart", "Pass after fixes"],
        ["Data and multi actions", "Dry run and run, parameters, 8 steps, 329 facts, several currencies", "Pass"],
        ["Live and import models", "Business CDS views through service ZUI_SAC_BIZ", "Pass"],
        ["Calendar", "Tasks, links, reminders", "Pass"],
        ["Security with two users", "Read, edit, no access, everyone, delete, unshare; server refuses what the client hides", "Pass after fixes"],
        ["Phone layout", "375 px wide: analyser, planning, designers, dialogs, navigation drawer", "Pass after fixes"],
        ["PaPM step", "Validation and the report that no PaPM is connected", "As designed (no PaPM on the system)"],
    ], [100, 270, 110])

    doc.add_heading("7. Defects the tests and the checks found", 1)
    table(doc, ["Defect", "Found by", "Safeguard"], [
        ["Delete of a model removed data before the server checked the right to delete", "End-to-end, two users", "Owner check first; sharing tests"],
        ["Shares stayed behind after the object was deleted", "End-to-end", "Sharing tests (deleting an object deletes its shares)"],
        ["Access not enforced on the projection views", "End-to-end, two users", "Access controls on all projections; manual in sap/docs"],
        ["Analyser CSV numbers like 12345.600000000001", "End-to-end (download)", "Rounded to six decimals"],
        ["Chart text dark on dark in the dark theme", "Manual (screenshot)", "Chart text never has a stroke; explicit light colours in dark mode"],
        ["Widgets could only be resized from one corner and left gaps", "Manual", "StorySchema.resizeBox and compact, tested in storylayout.test.js"],
    ], [220, 110, 150])

    doc.add_heading("8. Adding a test", 1)
    for i, b in enumerate([
        "Put the logic in a module without UI5 controls (under src/zsac/lib/core, engine, provider ...).",
        "Create test/node/<topic>.test.js and load the module with the loader.",
        "Write a test named after the rule, build the data in the test, assert with node:assert.",
        "Run npm test; commit the test together with the change.",
    ], 1):
        doc.add_paragraph(f"{i}. {b}")
    code(doc, "const test = require(\"node:test\");\nconst assert = require(\"node:assert\");\nconst req = require(\"./loader\");\nconst StorySchema = req(\"zsac/lib/core/StorySchema\");\n\ntest(\"tidy up: gaps close\", () => {\n  const s = { Widgets: [{ Id: \"A\", Page: 1, X: 0, Y: 4, W: 12, H: 2 }] };\n  assert.strictEqual(StorySchema.compact(s, 1), true);\n  assert.strictEqual(s.Widgets[0].Y, 0);\n});")

    doc.add_heading("9. Limits and next steps", 1)
    for b in [
        "No test drives the UI5 controls or the views; the screens are checked by hand. A browser based suite (OPA5 or Playwright against ?provider=mock) would cover the main flows without a backend.",
        "No ABAP unit tests. The behavior pools (ZBP_R_SAC_*), ZCL_SAC_ACCESS and the fact writer are the first candidates (ABAP Unit with test doubles for the database).",
        "The OData provider is tested only through its request layer with a stub model; the real service is covered only by the manual end-to-end checks.",
        "There is no pipeline yet; npm test can run on every push (for example in GitHub Actions) because it needs only Node.",
    ]:
        doc.add_paragraph(b, style="List Bullet")

    out = os.path.join(HERE, "..", "docs", "SAC_Fiori_Unit_Testing.docx")
    doc.save(out)
    print("written", os.path.abspath(out), total, "tests")


if __name__ == "__main__":
    build()
