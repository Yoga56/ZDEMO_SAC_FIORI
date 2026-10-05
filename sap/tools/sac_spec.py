"""One description of the SAC backend: tables, RAP business objects, abstract entities, classes.

gen_rap.py turns it into CDS, behavior definitions, projections and the service definition in sap/src;
abapgit_meta.py turns it into the abapGit XML that sits beside every source. The handlers and engines
(ZBP_R_SAC_*.locals_imp, ZCL_SAC_*) are written by hand and only listed here.

Field tuples are (NAME, TYPE) as in abapgit_meta: a leading * marks a key; TYPE is CHAR n | NUMC n | DATS | INT4 |
DEC l d | STRG | @ROLLNAME. The CDS element name is the camel case of the column (story_id -> StoryId).
"""

ADMIN = [
    ("CREATED_BY", "@ABP_CREATION_USER"),
    ("CREATED_AT", "@ABP_CREATION_TSTMPL"),
    ("LAST_CHANGED_BY", "@ABP_LASTCHANGE_USER"),
    ("LAST_CHANGED_AT", "@ABP_LASTCHANGE_TSTMPL"),
    ("LOCAL_LAST_CHANGED_AT", "@ABP_LOCINST_LASTCHANGE_TSTMPL"),
]
LOCAL_ONLY = [("LOCAL_LAST_CHANGED_AT", "@ABP_LOCINST_LASTCHANGE_TSTMPL")]
BOOL = "@ABAP_BOOLEAN"

# id, table, label, fields, admin, parent=(parent id, association name), children=[(child id, association name)]
# bdef: extra behavior lines; uses: lines for the projection; internal: no create/update through the service
ENTITIES = [
    dict(id="FILE", table="ZSAC_FILE", label="File", set="File", admin=ADMIN, fields=[
        ("*FILE_ID", "CHAR 32"), ("PARENT_ID", "CHAR 32"), ("FILE_TYPE", "CHAR 12"), ("OBJECT_ID", "CHAR 32"),
        ("FILE_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("OWNER_ID", "CHAR 12"),
        ("FAVOURITE", BOOL), ("SHARED", BOOL)]),

    dict(id="STORY", table="ZSAC_STORY", label="Story", set="Story", admin=ADMIN, children=[("WIDGET", "_Widget")], fields=[
        ("*STORY_ID", "CHAR 32"), ("STORY_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("MODEL_ID", "CHAR 20"),
        ("STATUS", "CHAR 1"), ("PAGES", "STRG"), ("FILTERS", "STRG")],
        validations=[("CheckName", "StoryName")]),
    dict(id="WIDGET", table="ZSAC_WIDGET", label="Story Widget", set="Widget", admin=LOCAL_ONLY, parent=("STORY", "_Story"), fields=[
        ("*STORY_ID", "CHAR 32"), ("*WIDGET_ID", "CHAR 32"), ("PAGE_NO", "INT4"), ("WIDGET_TYPE", "CHAR 24"), ("TITLE", "CHAR 80"),
        ("GRID_X", "INT4"), ("GRID_Y", "INT4"), ("GRID_W", "INT4"), ("GRID_H", "INT4"), ("BINDING", "STRG"), ("PROPS", "STRG")]),

    dict(id="MODEL", table="ZSAC_MODEL", label="Planning Model", set="Model", admin=ADMIN,
         children=[("DIM", "_Dimension"), ("MEASURE", "_Measure")], fields=[
        ("*MODEL_ID", "CHAR 20"), ("MODEL_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("CURRENCY", "CHAR 5"),
        ("PERIOD_FROM", "CHAR 7"), ("PERIOD_TO", "CHAR 7")],
        validations=[("CheckStructure", "ModelName")]),
    dict(id="DIM", table="ZSAC_DIM", label="Model Dimension", set="Dimension", admin=LOCAL_ONLY, parent=("MODEL", "_Model"), fields=[
        ("*MODEL_ID", "CHAR 20"), ("*DIM_ID", "CHAR 20"), ("LABEL", "CHAR 40"), ("SLOT", "INT4"), ("MEMBERS", "STRG")]),
    dict(id="MEASURE", table="ZSAC_MEASURE", label="Model Measure", set="Measure", admin=LOCAL_ONLY, parent=("MODEL", "_Model"), fields=[
        ("*MODEL_ID", "CHAR 20"), ("*MEASURE_ID", "CHAR 20"), ("LABEL", "CHAR 40"), ("UNIT", "CHAR 10"), ("AGGREGATION", "CHAR 10")]),

    dict(id="VERSION", table="ZSAC_VERSION", label="Planning Version", set="Version", admin=ADMIN, fields=[
        ("*MODEL_ID", "CHAR 20"), ("*VERSION_ID", "CHAR 12"), ("VERSION_NAME", "CHAR 80"), ("CATEGORY", "CHAR 10"),
        ("LOCKED", BOOL), ("OWNER_ID", "CHAR 12"), ("SOURCE_VERSION", "CHAR 12"), ("STATUS", "CHAR 1")],
        actions=["static action CreatePrivate parameter ZA_SAC_NEW_PRIVATE result [1] $self;",
                 "action Publish parameter ZA_SAC_PUBLISH result [1] ZA_SAC_PUBRESULT;",
                 "action Revert result [1] $self;"],
        uses=["use action CreatePrivate;", "use action Publish;", "use action Revert;"],
        determinations=[("DeleteFacts", "on modify", "delete;")]),

    dict(id="FACT", table="ZSAC_FACT", label="Plan Fact", set="Fact", admin=LOCAL_ONLY, fields=[
        ("*MODEL_ID", "CHAR 20"), ("*VERSION_ID", "CHAR 12"), ("*PERIOD", "CHAR 7"), ("*MEASURE", "CHAR 20"),
        ("*DIM1", "CHAR 40"), ("*DIM2", "CHAR 40"), ("*DIM3", "CHAR 40"), ("*DIM4", "CHAR 40"), ("*DIM5", "CHAR 40"),
        ("FACT_VALUE", "DEC 17 2")],
        actions=["// bulk upsert / delete: one tab separated line per fact (version, period, measure, dim1..dim5, value)",
                 "static action WriteFacts parameter ZA_SAC_FACT_BATCH;",
                 "static action DeleteFacts parameter ZA_SAC_FACT_BATCH;"],
        uses=["use action WriteFacts;", "use action DeleteFacts;"], service_ops=False),

    dict(id="DATAACT", table="ZSAC_DATAACT", label="Data Action", set="DataAction", admin=ADMIN, children=[("DASTEP", "_Step")], fields=[
        ("*ACTION_ID", "CHAR 32"), ("MODEL_ID", "CHAR 20"), ("ACTION_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255")],
        actions=["action Execute parameter ZA_SAC_DA_PARAM result [1] ZA_SAC_RUN_RESULT;"], uses=["use action Execute;"]),
    dict(id="DASTEP", table="ZSAC_DASTEP", label="Data Action Step", set="DataActionStep", admin=LOCAL_ONLY, parent=("DATAACT", "_DataAction"), fields=[
        ("*ACTION_ID", "CHAR 32"), ("*STEP_NO", "INT4"), ("STEP_TYPE", "CHAR 10"), ("SRC_VERSION", "CHAR 12"), ("TGT_VERSION", "CHAR 12"),
        ("FILTER_TEXT", "STRG"), ("FACTOR", "DEC 15 4"), ("TARGET_DIM", "CHAR 20"), ("TARGET_MEMBERS", "STRG")]),

    dict(id="MULTIACT", table="ZSAC_MULTIACT", label="Multi Action", set="MultiAction", admin=ADMIN, children=[("MASTEP", "_Step")], fields=[
        ("*ACTION_ID", "CHAR 32"), ("ACTION_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255")],
        actions=["action Run parameter ZA_SAC_DA_PARAM result [1] ZA_SAC_RUN_RESULT;"], uses=["use action Run;"]),
    dict(id="MASTEP", table="ZSAC_MASTEP", label="Multi Action Step", set="MultiActionStep", admin=LOCAL_ONLY, parent=("MULTIACT", "_MultiAction"), fields=[
        ("*ACTION_ID", "CHAR 32"), ("*STEP_NO", "INT4"), ("STEP_TYPE", "CHAR 12"), ("DATA_ACTION_ID", "CHAR 32"), ("MODEL_ID", "CHAR 20"),
        ("SOURCE_VERSION", "CHAR 12"), ("TARGET_VERSION", "CHAR 12")]),

    dict(id="CALTASK", table="ZSAC_CALTASK", label="Calendar Task", set="CalendarTask", admin=ADMIN, fields=[
        ("*TASK_ID", "CHAR 32"), ("TITLE", "CHAR 120"), ("MODEL_ID", "CHAR 20"), ("VERSION_ID", "CHAR 12"), ("ASSIGNEE", "CHAR 12"),
        ("DUE_DATE", "DATS"), ("STATUS", "CHAR 10"), ("APPROVER", "CHAR 12"), ("NOTES", "CHAR 255")]),
]

# abstract entities for action parameters / results: name -> (label, [(Element, abap type)])
ABSTRACT = {
    "ZA_SAC_NEW_PRIVATE": ("New Private Version", [("ModelId", "abap.char(20)"), ("SourceVersion", "abap.char(12)"), ("VersionName", "abap.char(80)")]),
    "ZA_SAC_PUBLISH": ("Publish Parameter", [("TargetVersion", "abap.char(12)")]),
    "ZA_SAC_PUBRESULT": ("Publish Result", [("Published", "abap.int4")]),
    "ZA_SAC_FACT_BATCH": ("Fact Batch", [("Payload", "abap.string")]),
    "ZA_SAC_DA_PARAM": ("Data Action Parameter", [("FilterText", "abap.string")]),
    "ZA_SAC_RUN_RESULT": ("Run Result", [("Changed", "abap.int4"), ("Status", "abap.char(1)"), ("LogText", "abap.string")]),
}

# hand-written global classes: name -> (description, category)
CLASSES = {
    "ZCL_SAC_FILTER": ("SAC: filter text (REGION=A,B;PERIOD=2026-01)", None),
    "ZCL_SAC_FACT_WRITER": ("SAC: read and write plan facts", None),
    "ZCL_SAC_VERSION_ENGINE": ("SAC: version publish and revert", None),
    "ZCL_SAC_DATAACT_ENGINE": ("SAC: data action engine", None),
    "ZCL_SAC_SEED": ("SAC: sample models, plan data, stories", None),
}


# column name -> CDS element name where the plain camel case would be a poor API name (VALUE is an ABAP keyword)
ALIASES = {"FACT_VALUE": "Value"}


def camel(column: str) -> str:
    if column.upper() in ALIASES:
        return ALIASES[column.upper()]
    return "".join(p.capitalize() for p in column.lower().split("_"))


def by_id():
    return {e["id"]: e for e in ENTITIES}


def roots():
    return [e for e in ENTITIES if "parent" not in e]


def r_view(e):
    return "ZR_SAC_" + e["id"]


def c_view(e):
    return "ZC_SAC_" + e["id"]


def pool(e):
    return "ZBP_R_SAC_" + e["id"]


def all_fields(e):
    return list(e["fields"]) + list(e.get("admin") or [])
