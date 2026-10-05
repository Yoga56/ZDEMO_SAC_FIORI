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


SALES = {
    "ModelId": "SALES_PLAN", "Name": "Sales Plan", "Description": "Revenue and cost by region, product and channel",
    "Currency": "USD", "PeriodFrom": "2026-01", "PeriodTo": "2026-12",
    "Dimensions": [
        {"DimId": "REGION", "Label": "Region", "Slot": 1, "Members": [
            {"Id": "APAC", "Text": "Asia Pacific"}, {"Id": "EMEA", "Text": "Europe, Middle East, Africa"},
            {"Id": "AMER", "Text": "Americas"}, {"Id": "LATAM", "Text": "Latin America"}]},
        {"DimId": "PRODUCT", "Label": "Product", "Slot": 2, "Members": [
            {"Id": "Cloud ERP", "Text": "Cloud ERP"}, {"Id": "Analytics", "Text": "Analytics"},
            {"Id": "Planning", "Text": "Planning"}, {"Id": "Services", "Text": "Services"},
            {"Id": "Licences", "Text": "Licences"}]},
        {"DimId": "CHANNEL", "Label": "Channel", "Slot": 3, "Members": [
            {"Id": "Direct", "Text": "Direct"}, {"Id": "Partner", "Text": "Partner"}]},
    ],
    "Measures": [
        {"MeasureId": "REVENUE", "Label": "Revenue", "Unit": "USD", "Aggregation": "SUM"},
        {"MeasureId": "COST", "Label": "Cost", "Unit": "USD", "Aggregation": "SUM"},
    ],
}
OPEX = {
    "ModelId": "OPEX_PLAN", "Name": "Opex Plan", "Description": "Operating expense by department and account",
    "Currency": "USD", "PeriodFrom": "2026-01", "PeriodTo": "2026-12",
    "Dimensions": [
        {"DimId": "DEPARTMENT", "Label": "Department", "Slot": 1, "Members": [
            {"Id": "Finance", "Text": "Finance"}, {"Id": "Sales", "Text": "Sales"}, {"Id": "R&D", "Text": "R&D"},
            {"Id": "Operations", "Text": "Operations"}, {"Id": "HR", "Text": "HR"}]},
        {"DimId": "ACCOUNT", "Label": "Account", "Slot": 2, "Members": [
            {"Id": "Salaries", "Text": "Salaries"}, {"Id": "Travel", "Text": "Travel"},
            {"Id": "Software", "Text": "Software"}, {"Id": "Facilities", "Text": "Facilities"}]},
    ],
    "Measures": [{"MeasureId": "AMOUNT", "Label": "Amount", "Unit": "USD", "Aggregation": "SUM"}],
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
    opex = {
        "Id": "STORY_OPEX", "Name": "Opex Review", "Description": "Operating expense by department", "ModelId": "OPEX_PLAN",
        "Status": "D", "Pages": [{"Id": 1, "Title": "Opex"}], "Filters": {},
        "Widgets": [
            {"Id": "O1", "Page": 1, "Type": "kpi", "Title": "Opex (Actual)", "X": 0, "Y": 0, "W": 4, "H": 2,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": [], "Columns": [], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT"], "PERIOD": ytd}},
             "Props": {"CompareVersion": "BUD", "Format": "k", "LowerIsBetter": True}},
            {"Id": "O2", "Page": 1, "Type": "chart.bar", "Title": "Opex by department", "X": 0, "Y": 2, "W": 8, "H": 4,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": ["DEPARTMENT"], "Columns": ["VERSION"], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT", "BUD"], "PERIOD": ytd}}, "Props": {}},
            {"Id": "O3", "Page": 1, "Type": "chart.donut", "Title": "Opex by account", "X": 8, "Y": 2, "W": 4, "H": 4,
             "Binding": {"ModelId": "OPEX_PLAN", "Rows": ["ACCOUNT"], "Columns": [], "Measure": "AMOUNT", "Filters": {"VERSION": ["ACT"]}}, "Props": {}},
        ],
    }
    return [sales, opex]


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
