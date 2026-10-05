"""Writes the abapGit XML that sits beside every ABAP / CDS source in sap/src.

The sources are written by gen_rap.py (CDS, behavior, service) or by hand (handlers, engines). The XML around
them is boilerplate that is easy to get subtly wrong (INTLEN, masks, class categories), so it is generated from
the object list in sac_spec.py. Adapted from sap/tools/abapgit_meta.py of Estate Command.

    python sap/tools/gen_rap.py && python sap/tools/abapgit_meta.py
"""

import re
from pathlib import Path

import sac_spec as S

SRC = Path(__file__).resolve().parent.parent / "src"
BOM = "\ufeff"

TABLES = {e["table"]: (e["label"], [("*CLIENT", "CLNT")] + S.all_fields(e)) for e in S.ENTITIES}

# no draft tables: the freestyle app edits through plain managed BOs
DRAFTS: list = []

CLASSES = dict(S.CLASSES)
for _e in S.roots():
    CLASSES[S.pool(_e)] = ("Behavior Definition for " + S.r_view(_e), "06")

INTERFACES: dict = {}

DDLS = {}
for _e in S.ENTITIES:
    DDLS[S.r_view(_e)] = _e["label"]
    DDLS[S.c_view(_e)] = _e["label"]
for _n, (_label, _el) in S.ABSTRACT.items():
    DDLS[_n] = _label

DDLX: list = []
DCLS: list = []
BDEF = [v(_e) for _e in S.roots() for v in (S.r_view, S.c_view)]
SRVD = {"ZUI_SAC_O4": "SAC analytics and planning service"}
# The service binding is created in ADT (its binding content cannot be written by hand) and is
# ignored in .abapgit.xml, so a pull never overwrites it.
SRVB: dict = {}


def _wrap(serializer: str, body: str) -> str:
    return (f'{BOM}<?xml version="1.0" encoding="utf-8"?>\n'
            f'<abapGit version="v1.0.0" serializer="{serializer}" serializer_version="v1.0.0">\n'
            ' <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">\n'
            '  <asx:values>\n'
            f'{body}'
            '  </asx:values>\n'
            ' </asx:abap>\n'
            '</abapGit>\n')


def _field(name: str, spec: str) -> str:
    key = name.startswith("*")
    name = name.lstrip("*")
    lines = [f"     <FIELDNAME>{name}</FIELDNAME>"]
    if key:
        lines.append("     <KEYFLAG>X</KEYFLAG>")
    if spec.startswith("@"):
        lines += [f"     <ROLLNAME>{spec[1:]}</ROLLNAME>", "     <ADMINFIELD>0</ADMINFIELD>"]
        if key:
            lines.append("     <NOTNULL>X</NOTNULL>")
        if spec == "@ABAP_BOOLEAN":
            lines += ["     <VALEXI>X</VALEXI>", "     <SHLPORIGIN>F</SHLPORIGIN>"]
        lines.append("     <COMPTYPE>E</COMPTYPE>")
    else:
        parts = spec.split()
        t = parts[0]
        if t == "CLNT":
            inttype, intlen, leng, dec = "C", 6, 3, None
        elif t in ("CHAR", "NUMC"):
            n = int(parts[1])
            inttype, intlen, leng, dec = ("C" if t == "CHAR" else "N"), 2 * n, n, None
        elif t == "DATS":
            inttype, intlen, leng, dec = "D", 16, 8, None
        elif t == "TIMS":
            inttype, intlen, leng, dec = "T", 12, 6, None
        elif t == "INT1":
            inttype, intlen, leng, dec = "X", 1, 3, None
        elif t == "INT4":
            inttype, intlen, leng, dec = "X", 4, 10, None
        elif t == "DEC":
            n, d = int(parts[1]), int(parts[2])
            inttype, intlen, leng, dec = "P", n // 2 + 1, n, d
        elif t == "STRG":
            inttype, intlen, leng, dec = "g", 8, None, None
        elif t == "RSTR":
            inttype, intlen, leng, dec = "y", 8, None, None
        else:
            raise ValueError(spec)
        lines += ["     <ADMINFIELD>0</ADMINFIELD>", f"     <INTTYPE>{inttype}</INTTYPE>",
                  f"     <INTLEN>{intlen:06d}</INTLEN>"]
        if key:
            lines.append("     <NOTNULL>X</NOTNULL>")
        lines.append(f"     <DATATYPE>{t}</DATATYPE>")
        if leng is not None:
            lines.append(f"     <LENG>{leng:06d}</LENG>")
        if dec:
            lines.append(f"     <DECIMALS>{dec:06d}</DECIMALS>")
        lines.append(f"     <MASK>  {t}</MASK>")
        if t == "DATS":
            lines.append("     <SHLPORIGIN>T</SHLPORIGIN>")
    return "    <DD03P>\n" + "\n".join(lines) + "\n    </DD03P>\n"


DRAFT_INCLUDE = ("    <DD03P>\n     <FIELDNAME>.INCLUDE</FIELDNAME>\n     <ADMINFIELD>0</ADMINFIELD>\n"
                 "     <PRECFIELD>SYCH_BDL_DRAFT_ADMIN_INC</PRECFIELD>\n     <MASK>      S</MASK>\n"
                 "     <DDTEXT>Standard Include for Draft Administration (BDL Syntax Check)</DDTEXT>\n"
                 "     <COMPTYPE>S</COMPTYPE>\n     <GROUPNAME>%ADMIN</GROUPNAME>\n    </DD03P>\n")


def draft_fields(active: str) -> list:
    """Draft table fields: the CDS element names of the active table's fields, client MANDT."""
    out = []
    for n, spec in TABLES[active][1]:
        key = n.startswith("*")
        bare = n.lstrip("*")
        if bare == "CLIENT":
            out.append(("*MANDT", "@MANDT"))
            continue
        out.append((("*" if key else "") + bare.replace("_", ""), spec))
    return out


def table(name: str, text: str, fields: list, draft: bool = False) -> str:
    body = ("   <DD02V>\n"
            f"    <TABNAME>{name}</TABNAME>\n"
            "    <DDLANGUAGE>E</DDLANGUAGE>\n"
            "    <TABCLASS>TRANSP</TABCLASS>\n"
            "    <CLIDEP>X</CLIDEP>\n"
            + ("    <LANGDEP>X</LANGDEP>\n" if draft else "") +
            f"    <DDTEXT>{text}</DDTEXT>\n"
            "    <MASTERLANG>E</MASTERLANG>\n"
            "    <CONTFLAG>A</CONTFLAG>\n"
            f"    <EXCLASS>{4 if draft else 1}</EXCLASS>\n"
            "   </DD02V>\n"
            "   <DD09L>\n"
            f"    <TABNAME>{name}</TABNAME>\n"
            "    <AS4LOCAL>A</AS4LOCAL>\n"
            f"    <TABKAT>{4 if draft else 0}</TABKAT>\n"
            f"    <TABART>{'APPL1' if draft else 'APPL0'}</TABART>\n"
            "    <BUFALLOW>N</BUFALLOW>\n"
            "   </DD09L>\n"
            "   <DD03P_TABLE>\n"
            + "".join(_field(n, s) for n, s in fields) + (DRAFT_INCLUDE if draft else "") +
            "   </DD03P_TABLE>\n")
    return _wrap("LCL_OBJECT_TABL", body)


def clas(name: str, text: str, category: str | None) -> str:
    lines = [f"    <CLSNAME>{name}</CLSNAME>", "    <LANGU>E</LANGU>", f"    <DESCRIPT>{text}</DESCRIPT>"]
    if category:
        lines.append(f"    <CATEGORY>{category}</CATEGORY>")
    lines.append("    <STATE>1</STATE>")
    if category == "06" or (SRC / f"{name.lower()}.clas.locals_imp.abap").exists():
        lines.append("    <CLSCCINCL>X</CLSCCINCL>")
    lines += ["    <FIXPT>X</FIXPT>", "    <UNICODE>X</UNICODE>"]
    if category == "06":
        lines.append(f"    <CLSDEFINT>{name.replace('ZBP_', 'Z')}</CLSDEFINT>")
    return _wrap("LCL_OBJECT_CLAS", "   <VSEOCLASS>\n" + "\n".join(lines) + "\n   </VSEOCLASS>\n")


def intf(name: str, text: str) -> str:
    return _wrap("LCL_OBJECT_INTF", "   <VSEOINTERF>\n"
                 f"    <CLSNAME>{name}</CLSNAME>\n    <LANGU>E</LANGU>\n    <DESCRIPT>{text}</DESCRIPT>\n"
                 "    <EXPOSURE>2</EXPOSURE>\n    <STATE>1</STATE>\n    <UNICODE>X</UNICODE>\n"
                 "   </VSEOINTERF>\n")


def ddls(name: str, text: str) -> str:
    src = (SRC / f"{name.lower()}.ddls.asddls").read_text(encoding="utf-8")
    kind = "A" if "abstract entity" in src else ("Q" if "custom entity" in src else
           ("P" if "projection on" in src else "W"))
    return _wrap("LCL_OBJECT_DDLS", "   <DDLS>\n"
                 f"    <DDLNAME>{name}</DDLNAME>\n    <DDLANGUAGE>E</DDLANGUAGE>\n"
                 f"    <DDTEXT>{text}</DDTEXT>\n    <SOURCE_TYPE>{kind}</SOURCE_TYPE>\n   </DDLS>\n")


def ddlx(name: str) -> str:
    return _wrap("LCL_OBJECT_DDLX", "   <DDLX>\n    <METADATA>\n"
                 f"     <NAME>{name}</NAME>\n     <DESCRIPTION>Metadata Extension for {name}</DESCRIPTION>\n"
                 "     <MASTER_LANGUAGE>EN</MASTER_LANGUAGE>\n    </METADATA>\n   </DDLX>\n")


def dcls(name: str) -> str:
    return _wrap("LCL_OBJECT_DCLS", "   <DCLS>\n"
                 f"    <DCLNAME>{name}</DCLNAME>\n    <DCL_TYPE>ROLE</DCL_TYPE>\n    <MASTERLANG>E</MASTERLANG>\n"
                 f"    <LANGUAGE>E</LANGUAGE>\n    <SHORT_TEXT>Access Control for {name}</SHORT_TEXT>\n"
                 "    <ABAP_LANGUAGE_VERSION>5</ABAP_LANGUAGE_VERSION>\n   </DCLS>\n")


def bdef(name: str) -> str:
    low = name.lower()
    return _wrap("LCL_OBJECT_BDEF", "   <BDEF>\n"
                 f"    <NAME>{name}</NAME>\n    <TYPE>BDEF/BDO</TYPE>\n"
                 f"    <DESCRIPTION>Behavior Definition for {name}</DESCRIPTION>\n"
                 "    <DESCRIPTION_TEXT_LIMIT>60</DESCRIPTION_TEXT_LIMIT>\n    <LANGUAGE>EN</LANGUAGE>\n"
                 "    <LINKS>\n"
                 "     <item>\n"
                 f"      <HREF>./{low}/source/main/versions</HREF>\n"
                 "      <REL>http://www.sap.com/adt/relations/versions</REL>\n"
                 "      <TITLE>Historic versions</TITLE>\n"
                 "     </item>\n"
                 "     <item>\n"
                 f"      <HREF>./{low}/source/main</HREF>\n"
                 "      <REL>http://www.sap.com/adt/relations/source</REL>\n"
                 "      <TYPE>text/plain</TYPE>\n"
                 "      <TITLE>Source Content</TITLE>\n"
                 "     </item>\n"
                 "     <item>\n"
                 f"      <HREF>./{low}/source/main</HREF>\n"
                 "      <REL>http://www.sap.com/adt/relations/source</REL>\n"
                 "      <TYPE>text/html</TYPE>\n"
                 "      <TITLE>Source Content (HTML)</TITLE>\n"
                 "     </item>\n"
                 "    </LINKS>\n"
                 "    <MASTER_LANGUAGE>EN</MASTER_LANGUAGE>\n    <ABAP_LANGU_VERSION>5</ABAP_LANGU_VERSION>\n"
                 f"    <SOURCE_URI>./{low}/source/main</SOURCE_URI>\n    <SOURCE_TYPE>ABAP_SOURCE</SOURCE_TYPE>\n"
                 "    <SOURCE_FIXED_POINT_ARITHMETIC>true</SOURCE_FIXED_POINT_ARITHMETIC>\n"
                 "    <SOURCE_UNICODE_CHECKS_ACTIVE>true</SOURCE_UNICODE_CHECKS_ACTIVE>\n   </BDEF>\n")


def srvd(name: str, text: str) -> str:
    return _wrap("LCL_OBJECT_SRVD", "   <SRVD>\n"
                 f"    <NAME>{name}</NAME>\n    <TYPE>SRVD/SRV</TYPE>\n    <DESCRIPTION>{text}</DESCRIPTION>\n"
                 "    <LANGUAGE>EN</LANGUAGE>\n    <MASTER_LANGUAGE>EN</MASTER_LANGUAGE>\n"
                 f"    <SOURCE_URI>./{name.lower()}/source/main</SOURCE_URI>\n    <SOURCE_TYPE>ABAP_SOURCE</SOURCE_TYPE>\n"
                 "    <SOURCE_ORIGIN_DESCRIPTION>ABAP Development Tools</SOURCE_ORIGIN_DESCRIPTION>\n"
                 "    <SRVD_SOURCE_TYPE>S</SRVD_SOURCE_TYPE>\n    <SRVD_SOURCE_TYPE_DESC>Definition</SRVD_SOURCE_TYPE_DESC>\n"
                 "   </SRVD>\n")


def srvb(name: str, definition: str) -> str:
    return _wrap("LCL_OBJECT_SRVB", "   <SRVB>\n    <METADATA>\n"
                 f"     <NAME>{name}</NAME>\n     <TYPE>SRVB/SVB</TYPE>\n"
                 f"     <DESCRIPTION>Service Binding for {definition}</DESCRIPTION>\n"
                 "     <LANGUAGE>EN</LANGUAGE>\n     <MASTER_LANGUAGE>EN</MASTER_LANGUAGE>\n"
                 "     <ABAP_LANGU_VERSION>5</ABAP_LANGU_VERSION>\n    </METADATA>\n    <CONTENT>\n"
                 f"     <BIND_TYPE_IMPL>\n      <NAME>{name}</NAME>\n     </BIND_TYPE_IMPL>\n"
                 "     <BIND_TYPE>ODATA</BIND_TYPE>\n     <BIND_TYPE_VERSION>V4</BIND_TYPE_VERSION>\n"
                 "     <SERVICES>\n      <item>\n"
                 f"       <SERVICE_NAME>{name}</SERVICE_NAME>\n       <SERVICE_CONTENT>\n        <item>\n"
                 "         <SERVICE_VERSION>0001</SERVICE_VERSION>\n         <RELEASE_STATE>NOT_RELEASED</RELEASE_STATE>\n"
                 "         <SRVD_REF>\n"
                 f"          <URI>/sap/bc/adt/ddic/srvd/sources/{definition.lower()}</URI>\n"
                 f"          <TYPE>SRVD/SRV</TYPE>\n          <NAME>{definition}</NAME>\n"
                 "         </SRVD_REF>\n         <BIND_TYPE_DATA>\n          <CONTENT>\n           <ENCODING>base64</ENCODING>\n"
                 "          </CONTENT>\n         </BIND_TYPE_DATA>\n        </item>\n       </SERVICE_CONTENT>\n      </item>\n"
                 "     </SERVICES>\n    </CONTENT>\n    <CONTRACT>C1</CONTRACT>\n    <RELEASE_SUPPORTED>true</RELEASE_SUPPORTED>\n"
                 "    <PUBLISHED>true</PUBLISHED>\n    <BINDING_CREATED>true</BINDING_CREATED>\n"
                 "    <ALLOWED_ACTION>UNPUBLISH</ALLOWED_ACTION>\n   </SRVB>\n")


def _cds_source(name: str) -> str:
    path = SRC / f"{name.lower()}.ddls.asddls"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _own_associations(src: str) -> set:
    targets = set(re.findall(r"composition\s*\[[^\]]*\]\s*of\s+(\w+)", src, re.I))
    targets |= set(re.findall(r"association\s+(?:to\s+parent\s+|\[[^\]]*\]\s*to\s+|to\s+)(\w+)", src, re.I))
    targets |= set(re.findall(r"redirected\s+to\s+(?:composition\s+child\s+|parent\s+)?(\w+)", src, re.I))
    return {t.upper() for t in targets}


def baseinfo(name: str) -> str:
    """The .ddls.baseinfo the system writes: data sources, association targets (a projection also
    carries those of its base) and, for a projection with associations, the base view."""
    src = _cds_source(name)
    sources = re.findall(r"(?:select\s+(?:distinct\s+)?from|projection\s+on)\s+(\w+)", src, re.I)
    sources = sorted({x.upper() for x in sources})
    associated = _own_associations(src)
    base = []
    projection = re.search(r"projection\s+on\s+(\w+)", src, re.I)
    if projection:
        associated |= _own_associations(_cds_source(projection.group(1)))
        if associated:
            base = [projection.group(1).upper()]

    def block(key, values):
        if not values:
            return f'"{key}":\n[],'
        return f'"{key}":\n[\n' + ",\n".join(f'"{v}"' for v in values) + "\n],"

    return ("{\n\"BASEINFO\":\n{\n" + block("FROM", sources) + "\n" + block("ASSOCIATED", sorted(associated)) + "\n"
            + block("BASE", base) + "\n" + block("ANNO_REF", []) + "\n" + block("SCALAR_FUNCTION", []) + "\n"
            + "\"VERSION\":0,\n\"ANNOREF_EVALUATION_ERROR\":\"\"\n}\n}")


PACKAGE = _wrap("LCL_OBJECT_DEVC", "   <DEVC>\n    <CTEXT>SAC style analytics and planning</CTEXT>\n"
                "    <LANGUAGE>E</LANGUAGE>\n    <MASTERLANG>E</MASTERLANG>\n    <SRV_CHECK>X</SRV_CHECK>\n   </DEVC>\n")


def main() -> None:
    out = {"package.devc.xml": PACKAGE}
    for n, (t, f) in TABLES.items():
        out[f"{n.lower()}.tabl.xml"] = table(n, t, f)
    for active in DRAFTS:
        name = active + "_D"
        out[f"{name.lower()}.tabl.xml"] = table(name, f"Draft table for {active}", draft_fields(active), draft=True)
    for n, (t, c) in CLASSES.items():
        out[f"{n.lower()}.clas.xml"] = clas(n, t, c)
    for n, t in INTERFACES.items():
        out[f"{n.lower()}.intf.xml"] = intf(n, t)
    for n, t in DDLS.items():
        out[f"{n.lower()}.ddls.xml"] = ddls(n, t)
        out[f"{n.lower()}.ddls.baseinfo"] = baseinfo(n)
    for n in DDLX:
        out[f"{n.lower()}.ddlx.xml"] = ddlx(n)
    for n in DCLS:
        out[f"{n.lower()}.dcls.xml"] = dcls(n)
    for n in BDEF:
        out[f"{n.lower()}.bdef.xml"] = bdef(n)
    for n, t in SRVD.items():
        out[f"{n.lower()}.srvd.xml"] = srvd(n, t)
    for n, d in SRVB.items():
        out[f"{n.lower()}.srvb.xml"] = srvb(n, d)
    for name, text in out.items():
        if name.endswith(".xml"):
            text = text.replace("'", "&apos;")  # as ADT serializes apostrophes in texts
        with open(SRC / name, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print(f"{len(out)} files written to {SRC}")


if __name__ == "__main__":
    main()
