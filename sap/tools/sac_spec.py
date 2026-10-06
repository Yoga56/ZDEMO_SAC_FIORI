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
    # who a story or a model is shared with: PRINCIPAL is a user name or * for everyone, ACCESS_LEVEL READ (open and use) or WRITE (edit).
    # OWNER_ID is the user who shared it. Anyone sees the rows that are about them or about everyone, the owner sees all rows of the object.
    dict(id="SHARE", table="ZSAC_SHARE", label="Share", set="Share", admin=ADMIN, fields=[
        ("*OBJECT_KIND", "CHAR 12"), ("*OBJECT_ID", "CHAR 32"), ("*PRINCIPAL", "CHAR 12"), ("ACCESS_LEVEL", "CHAR 5"), ("OWNER_ID", "CHAR 12")],
        validations=[("CheckShare", "AccessLevel")],
        determinations=[("SetOwner", "on modify", "create;")],
        readonly=["OWNER_ID"], auth="instance", dcl="share"),

    dict(id="FILE", table="ZSAC_FILE", label="File", set="File", admin=ADMIN, dcl="file", fields=[
        ("*FILE_ID", "CHAR 32"), ("PARENT_ID", "CHAR 32"), ("FILE_KIND", "CHAR 12"), ("OBJECT_ID", "CHAR 32"),
        ("FILE_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("OWNER_ID", "CHAR 12"),
        ("FAVOURITE", BOOL), ("SHARED", BOOL)]),

    dict(id="STORY", table="ZSAC_STORY", label="Story", set="Story", admin=ADMIN, children=[("WIDGET", "_Widget")], fields=[
        ("*STORY_ID", "CHAR 32"), ("STORY_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("MODEL_ID", "CHAR 20"),
        ("STATUS", "CHAR 1"), ("PAGES_JSON", "STRG"), ("FILTERS", "STRG"), ("OWNER_ID", "CHAR 12")],
        validations=[("CheckName", "StoryName")],
        determinations=[("SetOwner", "on modify", "create;")],
        # the owner is set by the system, never typed; the user's name travels with every row so the client knows who it is
        readonly=["OWNER_ID"], calc=[("CurrentUser", "$session.user")], auth="instance", dcl="owner", share_kind="STORY", share_id="StoryId"),
    dict(id="WIDGET", table="ZSAC_WIDGET", label="Story Widget", set="Widget", admin=LOCAL_ONLY, parent=("STORY", "_Story"), dcl="parent", fields=[
        ("*STORY_ID", "CHAR 32"), ("*WIDGET_ID", "CHAR 32"), ("PAGE_NO", "INT4"), ("WIDGET_KIND", "CHAR 24"), ("TITLE", "CHAR 80"),
        ("GRID_X", "INT4"), ("GRID_Y", "INT4"), ("GRID_W", "INT4"), ("GRID_H", "INT4"), ("BINDING", "STRG"), ("PROPS", "STRG")]),

    dict(id="MODEL", table="ZSAC_MODEL", label="Planning Model", set="Model", admin=ADMIN,
         children=[("DIM", "_Dimension"), ("MEASURE", "_Measure")], fields=[
        ("*MODEL_ID", "CHAR 20"), ("MODEL_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("CURRENCY", "CHAR 5"),
        ("PERIOD_FROM", "CHAR 7"), ("PERIOD_TO", "CHAR 7"), ("PLANNING_ENABLED", BOOL), ("DATA_LOCKING", BOOL),
        ("DATA_AUDIT", BOOL), ("DATA_SOURCE", "CHAR 80"), ("SOURCE_JSON", "STRG"), ("OWNER_ID", "CHAR 12"),
        # data locking: the default state outside every region (OPEN or LOCKED) and the JSON list of regions (see zsac.lib LockEngine)
        ("LOCK_DEFAULT", "CHAR 10"), ("LOCK_JSON", "STRG"),
        # validation rules: JSON list of limits a plan value must keep (zsac.lib ValidationEngine)
        ("VALID_JSON", "STRG"),
        # calculated measures: JSON list of { MeasureId, Label, Formula, Percent, Unit, Decimals } (zsac.lib CalcMeasures)
        ("CALC_JSON", "STRG")],
        validations=[("CheckStructure", "ModelName")],
        determinations=[("SetOwner", "on modify", "create;")],
        readonly=["OWNER_ID"], calc=[("CurrentUser", "$session.user")], auth="instance", dcl="owner", share_kind="MODEL", share_id="ModelId"),
    dict(id="DIM", table="ZSAC_DIM", label="Model Dimension", set="Dimension", admin=LOCAL_ONLY, parent=("MODEL", "_Model"), dcl="parent", fields=[
        ("*MODEL_ID", "CHAR 20"), ("*DIM_ID", "CHAR 20"), ("DIM_LABEL", "CHAR 40"), ("SLOT", "INT4"), ("MEMBERS", "STRG"),
        ("DIM_TYPE", "CHAR 12"), ("ATTRIBUTES", "STRG"), ("HIERARCHIES", "STRG")]),
    dict(id="MEASURE", table="ZSAC_MEASURE", label="Model Measure", set="Measure", admin=LOCAL_ONLY, parent=("MODEL", "_Model"), dcl="parent", fields=[
        ("*MODEL_ID", "CHAR 20"), ("*MEASURE_ID", "CHAR 20"), ("MEASURE_LABEL", "CHAR 40"), ("UNIT", "CHAR 10"), ("AGGREGATION", "CHAR 10"),
        ("DATA_TYPE", "CHAR 10"), ("UNIT_TYPE", "CHAR 10"), ("SCALE", "INT4"), ("DECIMALS", "INT4"), ("EXCEPTION_AGG", "CHAR 10"),
        ("EXCEPTION_DIMS", "CHAR 120")]),

    dict(id="VERSION", table="ZSAC_VERSION", label="Planning Version", set="Version", admin=ADMIN, dcl="model", fields=[
        ("*MODEL_ID", "CHAR 20"), ("*VERSION_ID", "CHAR 12"), ("VERSION_NAME", "CHAR 80"), ("CATEGORY", "CHAR 10"),
        ("LOCKED", BOOL), ("OWNER_ID", "CHAR 12"), ("SOURCE_VERSION", "CHAR 12"), ("STATUS", "CHAR 1")],
        actions=["static action CreatePrivate parameter ZA_SAC_NEW_PRIVATE result [1] $self;",
                 "action Publish parameter ZA_SAC_PUBLISH result [1] ZA_SAC_PUBRESULT;",
                 "action Revert result [1] $self;"],
        uses=["use action CreatePrivate;", "use action Publish;", "use action Revert;"],
        determinations=[("DeleteFacts", "on modify", "delete;")]),

    dict(id="FACT", table="ZSAC_FACT", label="Plan Fact", set="Fact", admin=LOCAL_ONLY, dcl="model", fields=[
        ("*MODEL_ID", "CHAR 20"), ("*VERSION_ID", "CHAR 12"), ("*PERIOD", "CHAR 7"), ("*MEASURE", "CHAR 20"),
        ("*DIM1", "CHAR 40"), ("*DIM2", "CHAR 40"), ("*DIM3", "CHAR 40"), ("*DIM4", "CHAR 40"), ("*DIM5", "CHAR 40"),
        ("FACT_VALUE", "DEC 17 2")],
        actions=["// bulk upsert / delete: one tab separated line per fact (version, period, measure, dim1..dim5, value)",
                 "static action WriteFacts parameter ZA_SAC_FACT_BATCH;",
                 "static action DeleteFacts parameter ZA_SAC_FACT_BATCH;"],
        uses=["use action WriteFacts;", "use action DeleteFacts;"], service_ops=False),

    # data actions run in the client (zsac.lib DataActionEngine); the backend stores the definitions and the run history.
    # PARAMETERS is the JSON list of parameters; CONFIG of a step is the JSON of everything that depends on the step type
    # (filter, copy rules, factor, allocation settings, embedded action ...), so a new step option needs no new column.
    dict(id="DATAACT", table="ZSAC_DATAACT", label="Data Action", set="DataAction", admin=ADMIN, children=[("DASTEP", "_Step")], fields=[
        ("*ACTION_ID", "CHAR 32"), ("MODEL_ID", "CHAR 20"), ("ACTION_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("PARAMETERS", "STRG"), ("OWNER_ID", "CHAR 12")],
        determinations=[("SetOwner", "on modify", "create;")],
        readonly=["OWNER_ID"], calc=[("CurrentUser", "$session.user")], auth="instance", dcl="owner", share_kind="DATAACTION", share_id="ActionId"),
    dict(id="DASTEP", table="ZSAC_DASTEP", label="Data Action Step", set="DataActionStep", admin=LOCAL_ONLY, parent=("DATAACT", "_DataAction"), dcl="parent", fields=[
        ("*ACTION_ID", "CHAR 32"), ("*STEP_NO", "INT4"), ("STEP_TYPE", "CHAR 10"), ("STEP_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"),
        ("ACTIVE", BOOL), ("CONFIG", "STRG")]),

    dict(id="MULTIACT", table="ZSAC_MULTIACT", label="Multi Action", set="MultiAction", admin=ADMIN, children=[("MASTEP", "_Step")], fields=[
        ("*ACTION_ID", "CHAR 32"), ("ACTION_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"), ("PARAMETERS", "STRG"), ("OWNER_ID", "CHAR 12")],
        determinations=[("SetOwner", "on modify", "create;")],
        readonly=["OWNER_ID"], calc=[("CurrentUser", "$session.user")], auth="instance", dcl="owner", share_kind="MULTIACTION", share_id="ActionId"),
    dict(id="MASTEP", table="ZSAC_MASTEP", label="Multi Action Step", set="MultiActionStep", admin=LOCAL_ONLY, parent=("MULTIACT", "_MultiAction"), dcl="parent", fields=[
        ("*ACTION_ID", "CHAR 32"), ("*STEP_NO", "INT4"), ("STEP_TYPE", "CHAR 12"), ("STEP_NAME", "CHAR 80"), ("DESCRIPTION", "CHAR 255"),
        ("ACTIVE", BOOL), ("CONFIG", "STRG")]),

    # history of data action and multi action runs (written by the client after every run, read by the Job Monitor tab)
    dict(id="RUN", table="ZSAC_RUN", label="Action Run", set="ActionRun", admin=LOCAL_ONLY, fields=[
        ("*RUN_ID", "CHAR 32"), ("ACTION_ID", "CHAR 32"), ("ACTION_NAME", "CHAR 80"), ("MODEL_ID", "CHAR 20"), ("RUN_KIND", "CHAR 5"),
        ("STATUS", "CHAR 1"), ("CHANGED", "INT4"), ("DURATION_MS", "INT4"), ("USER_NAME", "CHAR 12"), ("STARTED_AT", "CHAR 30"),
        ("PARAMS_TEXT", "CHAR 255"), ("LOG_TEXT", "STRG"), ("STEPS_JSON", "STRG")]),

    # comments on plan cells; author and time are the creation user and time of the row
    dict(id="COMMENT", table="ZSAC_COMMENT", label="Cell Comment", set="CellComment", admin=ADMIN, dcl="model", fields=[
        ("*COMMENT_ID", "CHAR 32"), ("MODEL_ID", "CHAR 20"), ("VERSION_ID", "CHAR 12"), ("PERIOD", "CHAR 10"), ("MEASURE", "CHAR 20"),
        ("DIMS_JSON", "STRG"), ("COMMENT_TEXT", "STRG")]),

    # an event of the calendar: a task or a process (PARENT_ID puts a task inside a process). The dates are START_DATE and END_DATE; DUE_DATE, ASSIGNEE and NOTES
    # are what the first calendar had and are kept in step (end date, first assignee, description). PEOPLE_JSON is { Owners, Assignees, Viewers }, FILES_JSON the
    # work files, CONFIG_JSON what depends on the type (action, parameters, what a locking task does, what the event waits for, the last run).
    # The people are shared through ZSAC_SHARE (kind CALEVENT), so the access control sees them.
    dict(id="CALTASK", table="ZSAC_CALTASK", label="Calendar Event", set="CalendarTask", admin=ADMIN, fields=[
        ("*TASK_ID", "CHAR 32"), ("TITLE", "CHAR 120"), ("MODEL_ID", "CHAR 20"), ("VERSION_ID", "CHAR 12"), ("ASSIGNEE", "CHAR 12"),
        ("DUE_DATE", "DATS"), ("STATUS", "CHAR 10"), ("APPROVER", "CHAR 12"), ("NOTES", "CHAR 255"),
        ("EVENT_TYPE", "CHAR 12"), ("PARENT_ID", "CHAR 32"), ("START_DATE", "DATS"), ("END_DATE", "DATS"), ("PROGRESS", "INT4"),
        ("PEOPLE_JSON", "STRG"), ("FILES_JSON", "STRG"), ("CONFIG_JSON", "STRG"), ("OWNER_ID", "CHAR 12")],
        determinations=[("SetOwner", "on modify", "create;")],
        readonly=["OWNER_ID"], calc=[("CurrentUser", "$session.user")], auth="instance", dcl="owner", share_kind="CALEVENT", share_id="TaskId"),
]

# abstract entities for action parameters / results: name -> (label, [(Element, abap type)])
ABSTRACT = {
    "ZA_SAC_NEW_PRIVATE": ("New Private Version", [("ModelId", "abap.char(20)"), ("SourceVersion", "abap.char(12)"), ("VersionName", "abap.char(80)")]),
    "ZA_SAC_PUBLISH": ("Publish Parameter", [("TargetVersion", "abap.char(12)")]),
    "ZA_SAC_PUBRESULT": ("Publish Result", [("Published", "abap.int4")]),
    "ZA_SAC_FACT_BATCH": ("Fact Batch", [("Payload", "abap.string")]),
}

# hand-written global classes: name -> (description, category)
CLASSES = {
    "ZCL_SAC_FACT_WRITER": ("SAC: read and write plan facts", None),
    "ZCL_SAC_VERSION_ENGINE": ("SAC: version publish and revert", None),
    "ZCL_SAC_SEED": ("SAC: sample models, plan data, stories", None),
    "ZCL_SAC_ACCESS": ("SAC: who may open and edit a story or model", None),
    "ZCL_SAC_DATA_RULES": ("SAC: data locking and validation on write", None),
    "ZCL_SAC_CLAIM_OWNERS": ("SAC: give existing content to its creators", None),
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
