"""Writes the sample data of zsac.lib's MockProvider into sap/app/saclib/src/zsac/lib/provider/mockdata.

    python sap/tools/make_mock_data.py

Two sample models (Sales Plan, Opex Plan) with Actual, Budget and Forecast versions, two sample dashboards,
two data actions and one multi action. ZCL_SAC_SEED builds the same shape in ABAP.
"""
import json
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "saclib" / "src" / "zsac" / "lib" / "provider" / "mockdata"
PERIODS = [f"2026-{m:02d}" for m in range(1, 13)]
NOW = "2026-10-05T09:00:00Z"


def noise(*parts):
    """Deterministic 0..1 so the sample is the same on every run and in ABAP."""
    return (zlib.crc32("|".join(map(str, parts)).encode()) % 1000) / 1000


def mem(i, t=None, **props):
    return {"Id": i, "Text": t or i, "Props": props}


SALES = {
    "ModelId": "SALES_PLAN", "Name": "Sales Plan", "Description": "Revenue and cost by region, product and channel",
    "Currency": "USD", "PeriodFrom": "2026-01", "PeriodTo": "2026-12",
    "PlanningEnabled": True, "DataLocking": True, "DataAudit": True, "DataSource": "Sample data (make_mock_data.py)",
    "Dimensions": [
        {"DimId": "REGION", "Label": "Region", "Slot": 1, "Type": "GENERIC", "Attributes": [], "Members": [
            mem("APAC", "Asia Pacific"), mem("EMEA", "Europe, Middle East, Africa"), mem("AMER", "Americas"), mem("LATAM", "Latin America"),
            mem("AMERICAS", "North and South America"), mem("EASTERN", "Eastern hemisphere"), mem("WORLD", "Worldwide")],
         "Hierarchies": [{"Id": "GEO", "Label": "Geography", "Parents": {
             "AMERICAS": "WORLD", "EASTERN": "WORLD", "AMER": "AMERICAS", "LATAM": "AMERICAS", "EMEA": "EASTERN", "APAC": "EASTERN"}}]},
        {"DimId": "PRODUCT", "Label": "Product", "Slot": 2, "Type": "GENERIC", "Attributes": [], "Members": [
            mem("Cloud ERP"), mem("Analytics"), mem("Planning"), mem("Services"), mem("Licences"), mem("RECURRING", "Recurring revenue"), mem("ONE_OFF", "One-off revenue")],
         "Hierarchies": [{"Id": "FAMILY", "Label": "Product family", "Parents": {
             "Cloud ERP": "RECURRING", "Analytics": "RECURRING", "Planning": "RECURRING", "Services": "ONE_OFF", "Licences": "ONE_OFF"}}]},
        {"DimId": "CHANNEL", "Label": "Channel", "Slot": 3, "Type": "GENERIC", "Attributes": [], "Members": [mem("Direct"), mem("Partner")], "Hierarchies": []},
    ],
    "Measures": [
        {"MeasureId": "REVENUE", "Label": "Revenue", "DataType": "Decimal", "Aggregation": "SUM", "UnitType": "Currency", "Unit": "USD", "Scale": 1, "Decimals": 0},
        {"MeasureId": "COST", "Label": "Cost", "DataType": "Decimal", "Aggregation": "SUM", "UnitType": "Currency", "Unit": "USD", "Scale": 1, "Decimals": 0},
    ],
}
OPEX = {
    "ModelId": "OPEX_PLAN", "Name": "Opex Plan", "Description": "Operating expense by department and account",
    "Currency": "USD", "PeriodFrom": "2026-01", "PeriodTo": "2026-12",
    "PlanningEnabled": True, "DataLocking": False, "DataAudit": False, "DataSource": "Sample data (make_mock_data.py)",
    "Dimensions": [
        {"DimId": "DEPARTMENT", "Label": "Department", "Slot": 1, "Type": "ORGANIZATION",
         "Attributes": [{"Id": "OWNER", "Label": "Owner"}, {"Id": "CURRENCY", "Label": "Currency"}], "Members": [
            mem("Finance", None, OWNER="CFO", CURRENCY="USD"), mem("Sales", None, OWNER="CSO", CURRENCY="USD"), mem("R&D", None, OWNER="CTO", CURRENCY="USD"),
            mem("Operations", None, OWNER="COO", CURRENCY="USD"), mem("HR", None, OWNER="CHRO", CURRENCY="USD"),
            mem("G_A", "General and administration", OWNER="CFO"), mem("OPS", "Operations and engineering", OWNER="COO"), mem("COMPANY", "Whole company", OWNER="CEO")],
         "Hierarchies": [{"Id": "ORG", "Label": "Organization", "Parents": {
             "G_A": "COMPANY", "OPS": "COMPANY", "Sales": "COMPANY", "Finance": "G_A", "HR": "G_A", "Operations": "OPS", "R&D": "OPS"}}]},
        {"DimId": "ACCOUNT", "Label": "Account", "Slot": 2, "Type": "ACCOUNT",
         "Attributes": [{"Id": "ACCOUNT_TYPE", "Label": "Account type"}, {"Id": "UNIT", "Label": "Unit"}], "Members": [
            mem("Salaries", None, ACCOUNT_TYPE="EXP", UNIT="USD"), mem("Travel", None, ACCOUNT_TYPE="EXP", UNIT="USD"), mem("Software", None, ACCOUNT_TYPE="EXP", UNIT="USD"),
            mem("Facilities", None, ACCOUNT_TYPE="EXP", UNIT="USD"), mem("PEOPLE", "People cost", ACCOUNT_TYPE="EXP"), mem("OTHER_OPEX", "Other operating cost", ACCOUNT_TYPE="EXP"),
            mem("OPEX_TOTAL", "Total operating expense", ACCOUNT_TYPE="EXP")],
         "Hierarchies": [{"Id": "PNL", "Label": "P&L structure", "Parents": {
             "PEOPLE": "OPEX_TOTAL", "OTHER_OPEX": "OPEX_TOTAL", "Salaries": "PEOPLE", "Travel": "OTHER_OPEX", "Software": "OTHER_OPEX", "Facilities": "OTHER_OPEX"}}]},
    ],
    "Measures": [{"MeasureId": "AMOUNT", "Label": "Amount", "DataType": "Decimal", "Aggregation": "SUM", "UnitType": "Currency", "Unit": "USD", "Scale": 1, "Decimals": 0}],
}


def sales_facts():
    base = {"REVENUE": 520, "COST": 310}
    region_w = {"APAC": 1.0, "EMEA": 1.25, "AMER": 1.6, "LATAM": 0.55}
    prod_w = {"Cloud ERP": 1.5, "Analytics": 1.0, "Planning": 0.8, "Services": 0.6, "Licences": 1.2}
    chan_w = {"Direct": 1.1, "Partner": 0.7}
    rows = []
    for version, periods in (("ACT", PERIODS[:9]), ("BUD", PERIODS), ("FCT", PERIODS)):
        for i, p in enumerate(PERIODS):
            if p not in periods:
                continue
            season = 1 + 0.05 * i + (0.12 if p.endswith(("-03", "-06", "-09", "-12")) else 0)
            for r, rw in region_w.items():
                for pr, pw in prod_w.items():
                    for ch, cw in chan_w.items():
                        for m, b in base.items():
                            v = b * rw * pw * cw * season
                            if version == "ACT":
                                v *= 0.9 + 0.2 * noise("a", p, r, pr, ch, m)
                            elif version == "FCT":
                                v *= 0.95 + 0.12 * noise("f", p, r, pr, ch, m)
                            rows.append({"ModelId": "SALES_PLAN", "VersionId": version, "Period": p, "Measure": m,
                                         "Dim1": r, "Dim2": pr, "Dim3": ch, "Dim4": "", "Dim5": "",
                                         "Value": round(v, 2)})
    return rows


def opex_facts():
    dept_w = {"Finance": 0.8, "Sales": 1.4, "R&D": 1.8, "Operations": 1.2, "HR": 0.6}
    acc_w = {"Salaries": 3.0, "Travel": 0.5, "Software": 0.9, "Facilities": 1.0}
    rows = []
    for version, periods in (("ACT", PERIODS[:9]), ("BUD", PERIODS), ("FCT", PERIODS)):
        for i, p in enumerate(PERIODS):
            if p not in periods:
                continue
            for d, dw in dept_w.items():
                for a, aw in acc_w.items():
                    v = 100 * dw * aw * (1 + 0.01 * i)
                    if version == "ACT":
                        v *= 0.92 + 0.18 * noise("oa", p, d, a)
                    elif version == "FCT":
                        v *= 0.97 + 0.08 * noise("of", p, d, a)
                    rows.append({"ModelId": "OPEX_PLAN", "VersionId": version, "Period": p, "Measure": "AMOUNT",
                                 "Dim1": d, "Dim2": a, "Dim3": "", "Dim4": "", "Dim5": "", "Value": round(v, 2)})
    return rows


def versions():
    out = []
    for m in ("SALES_PLAN", "OPEX_PLAN"):
        out += [
            {"ModelId": m, "VersionId": "ACT", "Name": "Actual", "Category": "ACTUAL", "Locked": True,
             "Owner": "SYSTEM", "SourceVersion": "", "Status": "P"},
            {"ModelId": m, "VersionId": "BUD", "Name": "Budget 2026", "Category": "BUDGET", "Locked": False,
             "Owner": "SYSTEM", "SourceVersion": "", "Status": "P"},
            {"ModelId": m, "VersionId": "FCT", "Name": "Forecast", "Category": "FORECAST", "Locked": False,
             "Owner": "SYSTEM", "SourceVersion": "", "Status": "P"},
        ]
    return out


def chart(i, type_, title, x, y, w, h, rows, cols, measure, filters, props=None):
    return {"Id": f"W{i}", "Page": 1, "Type": type_, "Title": title, "X": x, "Y": y, "W": w, "H": h,
            "Binding": {"ModelId": "SALES_PLAN", "Rows": rows, "Columns": cols, "Measure": measure, "Filters": filters},
            "Props": props or {}}


def stories():
    ytd = PERIODS[:9]
    sales = {
        "Id": "STORY_SALES", "Name": "Sales Performance", "Description": "Actual vs budget revenue, year to date",
        "ModelId": "SALES_PLAN", "Status": "P", "Pages": [{"Id": 1, "Title": "Overview"}, {"Id": 2, "Title": "Detail"}],
        "Filters": {},
        "Widgets": [
            chart(1, "text", "Sales Performance 2026", 0, 0, 12, 1, [], [], "", {}, {"Text": "Year to date, Jan to Sep. Actual against budget."}),
            chart(2, "kpi", "Revenue (Actual)", 0, 1, 3, 2, [], [], "REVENUE", {"VERSION": ["ACT"], "PERIOD": ytd}, {"CompareVersion": "BUD", "Format": "k"}),
            chart(3, "kpi", "Cost (Actual)", 3, 1, 3, 2, [], [], "COST", {"VERSION": ["ACT"], "PERIOD": ytd}, {"CompareVersion": "BUD", "Format": "k", "LowerIsBetter": True}),
            chart(4, "chart.gauge", "Budget attainment", 6, 1, 3, 2, [], [], "REVENUE", {"VERSION": ["ACT"], "PERIOD": ytd}, {"TargetVersion": "BUD"}),
            chart(5, "filter", "Region", 9, 1, 3, 2, [], [], "", {}, {"Dimension": "REGION"}),
            chart(6, "chart.bar", "Revenue by region, actual vs budget", 0, 3, 6, 4, ["REGION"], ["VERSION"], "REVENUE", {"VERSION": ["ACT", "BUD"], "MEASURE": ["REVENUE"], "PERIOD": ytd}),
            chart(7, "chart.line", "Revenue trend", 6, 3, 6, 4, ["PERIOD"], ["VERSION"], "REVENUE", {"VERSION": ["ACT", "BUD", "FCT"], "MEASURE": ["REVENUE"]}),
        ],
    }
    sales["Widgets"] += [
        {"Id": "W8", "Page": 2, "Type": "chart.donut", "Title": "Revenue mix by product", "X": 0, "Y": 0, "W": 4, "H": 4,
         "Binding": {"ModelId": "SALES_PLAN", "Rows": ["PRODUCT"], "Columns": [], "Measure": "REVENUE", "Filters": {"VERSION": ["ACT"], "MEASURE": ["REVENUE"]}}, "Props": {}},
        {"Id": "W9", "Page": 2, "Type": "chart.funnel", "Title": "Revenue by product (funnel)", "X": 4, "Y": 0, "W": 4, "H": 4,
         "Binding": {"ModelId": "SALES_PLAN", "Rows": ["PRODUCT"], "Columns": [], "Measure": "REVENUE", "Filters": {"VERSION": ["ACT"], "MEASURE": ["REVENUE"]}}, "Props": {}},
        {"Id": "W10", "Page": 2, "Type": "chart.sankey", "Title": "Revenue flow: region to product", "X": 8, "Y": 0, "W": 4, "H": 4,
         "Binding": {"ModelId": "SALES_PLAN", "Rows": ["REGION"], "Columns": ["PRODUCT"], "Measure": "REVENUE", "Filters": {"VERSION": ["ACT"], "MEASURE": ["REVENUE"]}}, "Props": {}},
        {"Id": "W11", "Page": 2, "Type": "table", "Title": "Revenue by region and product", "X": 0, "Y": 4, "W": 12, "H": 5,
         "Binding": {"ModelId": "SALES_PLAN", "Rows": ["REGION", "PRODUCT"], "Columns": ["VERSION"], "Measure": "REVENUE", "Filters": {"VERSION": ["ACT", "BUD"], "MEASURE": ["REVENUE"]}}, "Props": {}},
    ]
    sales["Widgets"].append(
        {"Id": "W12", "Page": 2, "Type": "table", "Title": "Revenue by region (geography hierarchy)", "X": 0, "Y": 9, "W": 12, "H": 5,
         "Binding": {"ModelId": "SALES_PLAN", "Rows": ["REGION"], "Columns": ["VERSION"], "Measure": "REVENUE", "Filters": {"VERSION": ["ACT", "BUD"], "MEASURE": ["REVENUE"]},
                     "Hierarchies": {"REGION": "GEO"}}, "Props": {"ExpandLevel": 2}})
    opex = {
        "Id": "STORY_OPEX", "Name": "Opex Review", "Description": "Operating expense by department", "ModelId": "OPEX_PLAN",
        "Status": "D", "Pages": [{"Id": 1, "Title": "Opex"}], "Filters": {},
        "Widgets": [
            {"Id": "O1", "Page": 1, "Type": "kpi", "Title": "Opex (Actual)", "X": 0, "Y": 0, "W": 4, "H": 2,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": [], "Columns": [], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT"], "PERIOD": ytd}},
             "Props": {"CompareVersion": "BUD", "Format": "k", "LowerIsBetter": True}},
            {"Id": "O2", "Page": 1, "Type": "chart.bar", "Title": "Opex by department", "X": 0, "Y": 2, "W": 8, "H": 4,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": ["DEPARTMENT"], "Columns": ["VERSION"], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT", "BUD"], "PERIOD": ytd}}, "Props": {}},
            {"Id": "O3", "Page": 1, "Type": "chart.donut", "Title": "Opex by account group", "X": 8, "Y": 2, "W": 4, "H": 4,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": ["ACCOUNT"], "Columns": [], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT"]}, "Hierarchies": {"ACCOUNT": "PNL"}},
             "Props": {"Level": 2}},
            {"Id": "O4", "Page": 1, "Type": "table", "Title": "Opex by organization", "X": 0, "Y": 6, "W": 12, "H": 5,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": ["DEPARTMENT"], "Columns": ["VERSION"], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT", "BUD"], "PERIOD": ytd},
                         "Hierarchies": {"DEPARTMENT": "ORG"}}, "Props": {"ExpandLevel": 2}},
        ],
    }
    plan = {
        "Id": "STORY_PLAN", "Name": "Sales Planning", "Description": "Plan revenue on the forecast version: edit, spread, publish",
        "ModelId": "SALES_PLAN", "Status": "D", "Pages": [{"Id": 1, "Title": "Plan"}], "Filters": {},
        "Widgets": [
            {"Id": "P1", "Page": 1, "Type": "text", "Title": "Sales Planning", "X": 0, "Y": 0, "W": 12, "H": 1, "Binding": {}, "Props": {"Text": "Type into any cell. A year, a quarter or a region total is spread over the numbers below it. Changes stay unpublished until you press Publish Data."}},
            {"Id": "P2", "Page": 1, "Type": "kpi", "Title": "Forecast revenue (incl. unpublished changes)", "X": 0, "Y": 1, "W": 4, "H": 2,
             "Binding": {"ModelId": "SALES_PLAN", "Rows": [], "Columns": [], "Measure": "REVENUE", "Filters": {"VERSION": ["FCT"]}}, "Props": {"CompareVersion": "BUD", "Format": "compact"}},
            {"Id": "P3", "Page": 1, "Type": "dataaction.trigger", "Title": "", "X": 4, "Y": 1, "W": 4, "H": 2,
             "Binding": {"ModelId": "SALES_PLAN", "Rows": [], "Columns": [], "Measure": "", "Filters": {}}, "Props": {"ActionId": "DA_FORECAST_FROM_ACT", "Subtitle": "Copies actuals into the forecast, then adds 5% for Q3", "ParamDims": ["REGION"]}},
            {"Id": "P4", "Page": 1, "Type": "filter", "Title": "Product", "X": 8, "Y": 1, "W": 4, "H": 2,
             "Binding": {"ModelId": "SALES_PLAN", "Rows": [], "Columns": [], "Measure": "", "Filters": {}}, "Props": {"Dimension": "PRODUCT"}},
            {"Id": "P5", "Page": 1, "Type": "planning.table", "Title": "Revenue forecast by region and month", "X": 0, "Y": 3, "W": 12, "H": 7,
             "Binding": {"ModelId": "SALES_PLAN", "Rows": ["REGION"], "Columns": ["PERIOD"], "Measure": "REVENUE", "Filters": {"VERSION": ["FCT"]},
                         "Hierarchies": {"PERIOD": "TIME", "REGION": "GEO"}},
             "Props": {"Editable": True, "ExpandRows": 3, "ExpandCols": 2, "ShowTotals": True, "Attributes": []}},
            {"Id": "P6", "Page": 1, "Type": "chart.line", "Title": "Revenue by version", "X": 0, "Y": 10, "W": 12, "H": 4,
             "Binding": {"ModelId": "SALES_PLAN", "Rows": ["PERIOD"], "Columns": ["VERSION"], "Measure": "REVENUE", "Filters": {"VERSION": ["ACT", "BUD", "FCT"], "MEASURE": ["REVENUE"]}}, "Props": {}},
        ],
    }
    return [sales, opex, plan]


def dataactions():
    return [
        {"Id": "DA_FORECAST_FROM_ACT", "ModelId": "SALES_PLAN", "Name": "Forecast Q4 from run-rate",
         "Description": "Copy actuals to the forecast and uplift 5%", "Steps": [
             {"StepNo": 10, "StepType": "COPY", "SrcVersion": "ACT", "TgtVersion": "FCT", "Filter": {}, "Factor": 1},
             {"StepNo": 20, "StepType": "SCALE", "TgtVersion": "FCT", "Filter": {"PERIOD": ["2026-07", "2026-08", "2026-09"]}, "Factor": 1.05}]},
        {"Id": "DA_ALLOC_OPEX", "ModelId": "OPEX_PLAN", "Name": "Allocate HR budget to departments",
         "Description": "Spread HR budget equally over three departments", "Steps": [
             {"StepNo": 10, "StepType": "ALLOCATE", "SrcVersion": "BUD", "TgtVersion": "FCT", "Filter": {"DEPARTMENT": ["HR"]},
              "TargetDim": "DEPARTMENT", "TargetMembers": ["Finance", "Sales", "Operations"]}]},
    ]


def multiactions():
    return [{"Id": "MA_FORECAST_CYCLE", "Name": "Forecast cycle", "Description": "Run the forecast action, then publish a private version to Forecast",
             "Steps": [
                 {"StepNo": 10, "StepType": "DATAACTION", "ActionId": "DA_FORECAST_FROM_ACT"},
                 {"StepNo": 20, "StepType": "PUBLISH", "ModelId": "SALES_PLAN", "SourceVersion": "FCT", "TargetVersion": "BUD"}]}]


def files():
    def f(i, t, oid, n, d, fav=False, shared=False, parent=""):
        return {"Id": i, "ParentId": parent, "Type": t, "ObjectId": oid, "Name": n, "Description": d, "Owner": "ME",
                "Favourite": fav, "Shared": shared, "ChangedAt": NOW}
    return [
        f("F_FOLDER_FIN", "FOLDER", "", "Finance", "Finance content"),
        f("F_STORY_STORY_SALES", "STORY", "STORY_SALES", "Sales Performance", "Actual vs budget revenue", True, True, "F_FOLDER_FIN"),
        f("F_STORY_STORY_OPEX", "STORY", "STORY_OPEX", "Opex Review", "Operating expense by department", False, False, "F_FOLDER_FIN"),
        f("F_STORY_STORY_PLAN", "STORY", "STORY_PLAN", "Sales Planning", "Plan revenue on the forecast version", True, False, "F_FOLDER_FIN"),
        f("F_MODEL_SALES_PLAN", "MODEL", "SALES_PLAN", "Sales Plan", "Revenue and cost by region, product and channel", True),
        f("F_MODEL_OPEX_PLAN", "MODEL", "OPEX_PLAN", "Opex Plan", "Operating expense by department and account"),
        f("F_DATAACTION_DA_FORECAST_FROM_ACT", "DATAACTION", "DA_FORECAST_FROM_ACT", "Forecast Q4 from run-rate", "", False, True),
        f("F_DATAACTION_DA_ALLOC_OPEX", "DATAACTION", "DA_ALLOC_OPEX", "Allocate HR budget to departments", ""),
        f("F_MULTIACTION_MA_FORECAST_CYCLE", "MULTIACTION", "MA_FORECAST_CYCLE", "Forecast cycle", ""),
    ]


def tasks():
    return [
        {"Id": "T1", "Title": "Submit Q4 forecast", "ModelId": "SALES_PLAN", "VersionId": "FCT", "Assignee": "ME", "DueDate": "2026-10-15", "Status": "OPEN", "Approver": "CFO", "Notes": "Regional leads submit by Oct 12"},
        {"Id": "T2", "Title": "Review budget 2027 assumptions", "ModelId": "SALES_PLAN", "VersionId": "BUD", "Assignee": "ME", "DueDate": "2026-10-31", "Status": "OPEN", "Approver": "CFO", "Notes": ""},
        {"Id": "T3", "Title": "Approve opex forecast", "ModelId": "OPEX_PLAN", "VersionId": "FCT", "Assignee": "CFO", "DueDate": "2026-10-20", "Status": "IN_REVIEW", "Approver": "CFO", "Notes": "Waiting for R&D"},
        {"Id": "T4", "Title": "Close September actuals", "ModelId": "SALES_PLAN", "VersionId": "ACT", "Assignee": "ME", "DueDate": "2026-10-05", "Status": "DONE", "Approver": "", "Notes": ""},
    ]


def dump(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {len(data)} rows")


if __name__ == "__main__":
    dump("models.json", [SALES, OPEX])
    dump("facts.json", sales_facts() + opex_facts())
    dump("versions.json", versions())
    dump("stories.json", stories())
    dump("dataactions.json", dataactions())
    dump("multiactions.json", multiactions())
    dump("files.json", files())
    dump("tasks.json", tasks())
    dump("audit.json", [])
