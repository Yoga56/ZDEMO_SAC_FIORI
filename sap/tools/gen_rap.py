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


def elem(e, col):
    """CDS element name of a column. A dependent entity may not have a field named like the etag master field of its root
    (LocalLastChangedAt), so the change timestamp of a child is ChildChangedAt."""
    col = col.lstrip("*")
    return "ChildChangedAt" if col == "LOCAL_LAST_CHANGED_AT" and "parent" in e else S.camel(col)


def key_cols(e):
    return [n.lstrip("*") for n, _ in e["fields"] if n.startswith("*")]


def access_assocs(e):
    """Associations the access control of an entity reads: the shares that apply to the current user (one row at most each, the key of a
    share is object and user) and, for plan data, the model it belongs to. Returns (lines of the view header, names to publish)."""
    kind = e.get("dcl")
    if kind == "owner":
        k, i = f"'{e['share_kind']}'", "$projection." + e["share_id"]
    elif kind == "file":
        k, i = "$projection.FileKind", "$projection.ObjectId"
    elif kind == "model":
        return ["  association [1] to ZR_SAC_MODEL as _Model on _Model.ModelId = $projection.ModelId"], ["_Model"]
    else:
        return [], []
    lines = [f"  association [0..1] to ZR_SAC_SHARE as _ShareMe  on _ShareMe.ObjectKind = {k} and _ShareMe.ObjectId = {i} and _ShareMe.Principal = $session.user",
             f"  association [0..1] to ZR_SAC_SHARE as _ShareAll on _ShareAll.ObjectKind = {k} and _ShareAll.ObjectId = {i} and _ShareAll.Principal = '*'"]
    return lines, ["_ShareMe", "_ShareAll"]


def r_ddls(e, E):
    root = "parent" not in e
    check = "#CHECK" if e.get("dcl") else "#NOT_REQUIRED"
    lines = [f"@AccessControl.authorizationCheck: {check}", "@Metadata.allowExtensions: true",
             f"@EndUserText.label: '{e['label']}'"]
    head = f"define {'root ' if root else ''}view entity {S.r_view(e)}\n  as select from {e['table'].lower()}"
    for cid, assoc in e.get("children", []):
        head += f"\n  composition [0..*] of {S.r_view(E[cid])} as {assoc}"
    if not root:
        pid, assoc = e["parent"]
        cond = " and ".join(f"$projection.{S.camel(k)} = {assoc}.{S.camel(k)}" for k in key_cols(E[pid]))
        head += f"\n  association to parent {S.r_view(E[pid])} as {assoc} on {cond}"
    a_lines, a_names = access_assocs(e)
    for l in a_lines:
        head += "\n" + l
    body = []
    for n, _ in S.all_fields(e):
        col = n.lstrip("*")
        anno = ADMIN_ANNO.get(col) if elem(e, col) == S.camel(col) else None   # only the etag master of a root carries the annotation
        # an annotation stands on its own line before the element and takes no comma
        body.append((f"  {anno}\n" if anno else "") + f"  {'key ' if n.startswith('*') else ''}{col.lower()} as {elem(e, col)}")
    for name, expr in e.get("calc", []):   # elements worked out by the view, not columns of the table
        body.append(f"  {expr} as {name}")
    exposed = [a for _, a in e.get("children", [])] + ([e["parent"][1]] if not root else []) + a_names
    out = ",\n".join(body + (["  " + a for a in exposed]))
    return "\n".join(lines) + "\n" + head + "\n{\n" + out + "\n}\n"


def c_ddls(e, E):
    root = "parent" not in e
    lines = ["@Metadata.allowExtensions: true", "@Metadata.ignorePropagatedAnnotations: true",
             f"@EndUserText.label: '{e['label']}'", "@AccessControl.authorizationCheck: #NOT_REQUIRED"]
    head = f"define {'root ' if root else ''}view entity {S.c_view(e)}\n  {'provider contract transactional_query' + chr(10) + '  ' if root else ''}as projection on {S.r_view(e)}"
    body = [f"  {'key ' if n.startswith('*') else ''}{elem(e, n)}" for n, _ in S.all_fields(e)]
    body += [f"  {name}" for name, _ in e.get("calc", [])]
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
        out += ["lock master", f"authorization master ( {e.get('auth', 'global')} )", "etag master LocalLastChangedAt"]
    else:
        pid, assoc = e["parent"]
        out += [f"lock dependent by {assoc}", f"authorization dependent by {assoc}", f"etag dependent by {assoc}"]
    out.append("{")
    # keys are given by the caller (external numbering): required when creating, fixed afterwards. The keys a child inherits from its parent are read only.
    parent_keys = set(key_cols(E[e["parent"][0]])) if not root else set()
    own = [S.camel(k) for k in key_cols(e) if k not in parent_keys]
    if own:
        out += ["  field ( mandatory : create )", "   " + ",\n   ".join(own) + ";", "", "  field ( readonly : update )", "   " + ",\n   ".join(own) + ";", ""]
    readonly = [elem(e, n) for n, _ in (e.get("admin") or [])] + [S.camel(c) for c in e.get("readonly", [])] + [name for name, _ in e.get("calc", [])]
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
        out.append(f"    {elem(e, col)} = {col.lower()};")
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


def dcls(e, E):
    """Access control: who may read the rows. Owner and shares for stories, models and files (shares are looked up with the associations of the
    view); a dependent node and plan data take the conditions of the object they belong to; a share is for the owner and for who it names."""
    name, kind = S.r_view(e), e["dcl"]
    if kind == "owner":
        cond = ["OwnerId = aspect user", "OwnerId = ''", "OwnerId = '*'", "_ShareMe.Principal = aspect user", "_ShareAll.Principal = '*'"]
        body = "    where " + "\n       or ".join(cond) + ";"
    elif kind == "file":
        # folders are open; the file of any other object shows to whoever may open the object. SEED and SYSTEM stand for sample content.
        cond = ["FileKind = 'FOLDER'", "OwnerId = aspect user", "OwnerId = ''", "OwnerId = '*'", "OwnerId = 'SEED'",
                "OwnerId = 'SYSTEM'", "_ShareMe.Principal = aspect user", "_ShareAll.Principal = '*'"]
        body = "    where " + "\n       or ".join(cond) + ";"
    elif kind == "share":
        body = "    where OwnerId = aspect user\n       or Principal = aspect user\n       or Principal = '*';"
    else:
        parent = S.r_view(E[e["parent"][0]]) if kind == "parent" else "ZR_SAC_MODEL"
        assoc = e["parent"][1] if kind == "parent" else "_Model"
        # the conditions of the parent are about the parent's own fields (OwnerId, _ShareMe ...): they are read through the association to it
        body = f"    where inheriting conditions from entity {parent}\n      replacing {{ root with {assoc} }};"
    return (f"@EndUserText.label: 'Access control for {e['label'].lower()}'\n@MappingRole: true\ndefine role {name}\n{{\n  grant select on {name}\n{body}\n}}\n")


def abstract(name, label, elements):
    body = "\n".join(f"  {el} : {t};" for el, t in elements)
    return f"@EndUserText.label: '{label}'\ndefine abstract entity {name}\n{{\n{body}\n}}\n"


def service(E):
    exposes = "\n".join(f"  expose {S.c_view(e):<18} as {e['set']};" for e in S.ENTITIES)
    exposes += "".join(f"\n  expose {n:<18} as {v[1]};" for n, v in S.EXTRA_DDLS.items())
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
    for name, v in S.EXTRA_DDLS.items():
        write(f"{name.lower()}.ddls.asddls", v[2])
    for e in S.ENTITIES:
        if e.get("dcl"):
            write(f"{S.r_view(e).lower()}.dcls.asdcls", dcls(e, E))
    write("zui_sac_o4.srvd.srvdsrv", service(E))
    print("sources written to", SRC)


if __name__ == "__main__":
    main()
