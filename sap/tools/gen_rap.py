"""Writes the CDS, behavior and service sources of the SAC backend into sap/src from sac_spec.py.

    python sap/tools/gen_rap.py && python sap/tools/abapgit_meta.py

Hand-written files (behavior handlers, engines, seed) are never touched.
"""
from pathlib import Path

import sac_spec as S

SRC = Path(__file__).resolve().parent.parent / "src"
ADMIN_ANNO = {
    "CREATED_BY": "@Semantics.user.createdBy: true",
    "CREATED_AT": "@Semantics.systemDateTime.createdAt: true",
    "LAST_CHANGED_BY": "@Semantics.user.lastChangedBy: true",
    "LAST_CHANGED_AT": "@Semantics.systemDateTime.lastChangedAt: true",
    "LOCAL_LAST_CHANGED_AT": "@Semantics.systemDateTime.localInstanceLastChangedAt: true",
}


def write(name: str, text: str) -> None:
    (SRC / name).write_text(text, encoding="utf-8", newline="\n")


def key_cols(e):
    return [n.lstrip("*") for n, _ in e["fields"] if n.startswith("*")]


def r_ddls(e, E):
    root = "parent" not in e
    lines = ["@AccessControl.authorizationCheck: #NOT_REQUIRED", "@Metadata.allowExtensions: true",
             f"@EndUserText.label: '{e['label']}'"]
    head = f"define {'root ' if root else ''}view entity {S.r_view(e)}\n  as select from {e['table'].lower()}"
    for cid, assoc in e.get("children", []):
        head += f"\n  composition [0..*] of {S.r_view(E[cid])} as {assoc}"
    if not root:
        pid, assoc = e["parent"]
        cond = " and ".join(f"$projection.{S.camel(k)} = {assoc}.{S.camel(k)}" for k in key_cols(E[pid]))
        head += f"\n  association to parent {S.r_view(E[pid])} as {assoc} on {cond}"
    body = []
    for n, _ in S.all_fields(e):
        col = n.lstrip("*")
        anno = ADMIN_ANNO.get(col)
        # an annotation stands on its own line before the element and takes no comma
        body.append((f"  {anno}\n" if anno else "") + f"  {'key ' if n.startswith('*') else ''}{col.lower()} as {S.camel(col)}")
    exposed = [a for _, a in e.get("children", [])] + ([e["parent"][1]] if not root else [])
    out = ",\n".join(body + (["  " + a for a in exposed]))
    return "\n".join(lines) + "\n" + head + "\n{\n" + out + "\n}\n"


def c_ddls(e, E):
    root = "parent" not in e
    lines = ["@Metadata.allowExtensions: true", "@Metadata.ignorePropagatedAnnotations: true",
             f"@EndUserText.label: '{e['label']}'", "@AccessControl.authorizationCheck: #NOT_REQUIRED"]
    head = f"define {'root ' if root else ''}view entity {S.c_view(e)}\n  {'provider contract transactional_query' + chr(10) + '  ' if root else ''}as projection on {S.r_view(e)}"
    body = [f"  {'key ' if n.startswith('*') else ''}{S.camel(n.lstrip('*'))}" for n, _ in S.all_fields(e)]
    for cid, assoc in e.get("children", []):
        body.append(f"  {assoc} : redirected to composition child {S.c_view(E[cid])}")
    if not root:
        pid, assoc = e["parent"]
        body.append(f"  {assoc} : redirected to parent {S.c_view(E[pid])}")
    return "\n".join(lines) + "\n" + head + "\n{\n" + ",\n".join(body) + "\n}\n"


def r_bdef(e, E):
    root = "parent" not in e
    name = S.r_view(e)
    out = []
    if root:
        out += [f"managed implementation in class {S.pool(e)} unique;", "strict ( 2 );", ""]
    out += [f"define behavior for {name} alias {e['set']}", f"persistent table {e['table'].lower()}"]
    if root:
        out += ["lock master", "authorization master ( global )", "etag master LocalLastChangedAt"]
    else:
        pid, assoc = e["parent"]
        out += [f"lock dependent by {assoc}", f"authorization dependent by {assoc}", f"etag dependent by {assoc}"]
    out.append("{")
    readonly = [S.camel(n) for n, _ in (e.get("admin") or [])]
    if not root:
        readonly = [S.camel(k) for k in key_cols(E[e["parent"][0]])] + readonly
    if readonly:
        out += ["  field ( readonly )", "   " + ",\n   ".join(readonly) + ";", ""]
    out.append("  create;" if root or e["id"] == "FACT" else "  // created through its parent")
    out += ["  update;", "  delete;"]
    for cid, assoc in e.get("children", []):
        out.append(f"  association {assoc} {{ create; }}")
    if not root:
        out.append(f"  association {e['parent'][1]};")
    for a in e.get("actions", []):
        out.append("  " + a)
    for v, field in e.get("validations", []):
        out.append(f"  validation {v} on save {{ field {field}; create; update; }}")
    for d, when, trig in e.get("determinations", []):
        out.append(f"  determination {d} {when} {{ {trig} }}")
    out += ["", f"  mapping for {e['table'].lower()}", "  {"]
    for n, _ in S.all_fields(e):
        col = n.lstrip("*")
        out.append(f"    {S.camel(col)} = {col.lower()};")
    out += ["  }", "}"]
    return "\n".join(out) + "\n"


def c_bdef(e, E):
    root = "parent" not in e
    out = []
    if root and e["id"] == roots_first(E):
        pass
    out += [f"define behavior for {S.c_view(e)} alias {e['set']}", "use etag", "{"]
    if e.get("service_ops", True):
        if root:
            out.append("  use create;")
        out += ["  use update;", "  use delete;"]
    for u in e.get("uses", []):
        out.append("  " + u)
    for cid, assoc in e.get("children", []):
        out.append(f"  use association {assoc} {{ create; }}")
    if not root:
        out.append(f"  use association {e['parent'][1]};")
    out.append("}")
    return "\n".join(out) + "\n"


def roots_first(E):
    return None


def abstract(name, label, elements):
    body = "\n".join(f"  {el} : {t};" for el, t in elements)
    return f"@EndUserText.label: '{label}'\ndefine abstract entity {name}\n{{\n{body}\n}}\n"


def service(E):
    exposes = "\n".join(f"  expose {S.c_view(e):<18} as {e['set']};" for e in S.ENTITIES)
    return ("@EndUserText: {\n  label: 'SAC analytics and planning service'\n}\n@ObjectModel: {\n  leadingEntity: {\n    name: 'ZC_SAC_STORY'\n  }\n}\n"
            "define service ZUI_SAC_O4\n  provider contracts odata_v4_ui {\n" + exposes + "\n}\n")


def pool_class(e):
    n = S.pool(e).lower()
    return (f"CLASS {n} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF {S.r_view(e).lower()}.\nENDCLASS.\n\n"
            f"CLASS {n} IMPLEMENTATION.\nENDCLASS.\n")


def main():
    E = S.by_id()
    for e in S.ENTITIES:
        write(f"{S.r_view(e).lower()}.ddls.asddls", r_ddls(e, E))
        write(f"{S.c_view(e).lower()}.ddls.asddls", c_ddls(e, E))
    for e in S.roots():
        group = [e] + [E[c] for c, _ in e.get("children", [])]
        write(f"{S.r_view(e).lower()}.bdef.asbdef", "\n".join(r_bdef(x, E) for x in group))
        write(f"{S.c_view(e).lower()}.bdef.asbdef", "projection;\nstrict ( 2 );\n\n" + "\n".join(c_bdef(x, E) for x in group))
        write(f"{S.pool(e).lower()}.clas.abap", pool_class(e))
    for name, (label, elements) in S.ABSTRACT.items():
        write(f"{name.lower()}.ddls.asddls", abstract(name, label, elements))
    write("zui_sac_o4.srvd.srvdsrv", service(E))
    print("sources written to", SRC)


if __name__ == "__main__":
    main()
