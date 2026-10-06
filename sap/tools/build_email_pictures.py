"""Three pictures for an email about SAC Lite (gradient background, blurred glow, frosted glass panels).
Run from sap/:  python3 tools/build_email_pictures.py   (needs Google Chrome; writes sap/docs/img/email-*.png)"""
import os, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.abspath(os.path.join(HERE, "..", "docs", "img"))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1400px;height:HEIGHTpx;overflow:hidden}
body{position:relative;font-family:'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif;color:#f6f4ee;
  background:linear-gradient(135deg,#041f27 0%,#004a5a 48%,#0a6672 100%)}
.orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.75}
.o1{width:520px;height:520px;right:-120px;top:-140px;background:#e07a4f;opacity:.55}
.o2{width:640px;height:640px;left:-200px;bottom:-220px;background:#5294a3;opacity:.6}
.o3{width:380px;height:380px;left:48%;top:36%;background:#2f8f9d;opacity:.35}
.wrap{position:relative;padding:44px 56px 0}
.badge{display:inline-flex;align-items:center;gap:12px}
.pill{background:linear-gradient(135deg,#f08a5d,#d9663a);color:#fff;font-weight:700;font-size:22px;padding:8px 22px;border-radius:999px;letter-spacing:.5px;box-shadow:0 8px 24px rgba(224,122,79,.45)}
.eb{font-size:15px;letter-spacing:3px;text-transform:uppercase;color:#f2c1a8;font-weight:600}
h1{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:54px;margin-top:16px;line-height:1.06}
.sub{font-size:20px;margin-top:12px;color:#cfe1e5;max-width:1150px;line-height:1.4}
.glass{background:rgba(255,255,255,.10);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.24);box-shadow:0 18px 50px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.25);border-radius:24px}
.grid{position:relative;display:grid;gap:20px;padding:26px 56px 0}
.tile{padding:10px;position:relative}
.tile .in{position:relative;border-radius:16px;overflow:hidden;background:#fff;height:100%}
.tile img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
.tag{position:absolute;left:22px;bottom:22px;background:rgba(7,53,64,.78);backdrop-filter:blur(10px);color:#fff;font-size:15px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25)}
.chips{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:20px 56px 0}
.chip{padding:18px 22px}
.chip b{font-family:'Fraunces',Georgia,serif;font-size:23px;font-weight:600;display:block;margin-bottom:6px;color:#fff}
.chip span{font-size:16px;line-height:1.45;color:#d6e6e9}
.foot{position:relative;padding:18px 56px 0;font-size:14px;color:#a9c6cc;display:flex;justify-content:space-between}
"""

def page(name, height, eb, title, sub, grid_cols, tiles, chips, foot):
    h = f"<html><head><meta charset='utf-8'><style>{CSS.replace('HEIGHT', str(height))}</style></head><body>"
    h += "<div class='orb o1'></div><div class='orb o2'></div><div class='orb o3'></div>"
    h += f"<div class='wrap'><div class='badge'><span class='pill'>SAC Lite</span><span class='eb'>{eb}</span></div><h1>{title}</h1><div class='sub'>{sub}</div></div>"
    h += f"<div class='grid' style='grid-template-columns:{grid_cols}'>"
    for (img, tag, style, extra) in tiles:
        h += f"<div class='tile glass' style='{style}'><div class='in'><img src='file://{IMG}/{img}' style='{extra}'></div><div class='tag'>{tag}</div></div>"
    h += "</div><div class='chips'>"
    for t, d in chips:
        h += f"<div class='chip glass'><b>{t}</b><span>{d}</span></div>"
    h += f"</div><div class='foot'><span>{foot}</span><span>SAC Lite is a custom application on SAP S/4HANA Cloud</span></div></body></html>"
    path = os.path.join(tempfile.gettempdir(), name + ".html")
    open(path, "w").write(h)
    out = os.path.join(IMG, name + ".png")
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=12000", f"--window-size=1400,{height}",
                    "--allow-file-access-from-files", f"--screenshot={out}", "file://" + path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print("written", out)

SUB = "The working model of SAP Analytics Cloud, inside S/4HANA and the Fiori launchpad, on your own authorizations."

page("email-1-analyse", 1010, "Analytics and planning on Fiori", "See your S/4HANA data, live", SUB, "780px 1fr",
     [("gl-01-story-overview.jpg", "Live G/L story on 1,092 rows", "height:540px", ""),
      ("03-story-overview.png", "Charts, KPIs and filters in one story", "height:540px", "")],
     [("Live from S/4HANA", "Any CDS view as a live or import source. The service does the aggregation."),
      ("Stories and analysis", "Eleven chart types, KPIs, tables, maps, filters. Free analysis with CSV and Excel export."),
      ("Insight built in", "Variance explainer, value driver tree and Compass simulation.")],
     "Tested end to end on a real S/4HANA Cloud system.")

page("email-2-plan", 1010, "Analytics and planning on Fiori", "Plan, control and automate",
     "Versions, locking and rules for planners; data actions and multi actions that do the repetitive work.", "780px 1fr",
     [("08-planning-validation-rule.jpg", "Validation rules on plan values", "height:540px", ""),
      ("13-multi-action-lock-stops-run.jpg", "Multi action stops at a lock", "height:540px", "transform:scale(1.45);transform-origin:50% 50%;object-position:center")],
     [("Plan safely", "Private versions, publish and revert, history, comments on cells, locking regions and validation rules."),
      ("Automate", "Seven data action steps and eleven multi action steps: allocate, convert currency, forecast, import, call an API."),
      ("Share and secure", "Owner, view, edit or everyone, enforced by the server. Calendar with approvals and reminders.")],
     "Tested with two users on a real S/4HANA Cloud system: 221 unit tests, 28 end-to-end checks.")

page("email-3-insight", 1170, "Analytics and planning on Fiori", "Why it changed, what if, how safe",
     "Insight tools built into the stories: a value driver tree to simulate, a Compass to measure the risk, a variance explainer to find the cause.", "1fr 1fr",
     [("vdt-simulation.jpg", "Value driver tree: +10% on Cloud ERP lifts profit +7.2%", "height:590px", ""),
      ("compass-simulation.jpg", "Compass: 10,000 runs, 51% chance of reaching the baseline", "height:590px", "")],
     [("Value driver tree", "Type a percentage under any driver and watch the effect reach the top, against budget."),
      ("Compass simulation", "Monte Carlo on uncertain drivers: pessimistic, realistic and optimistic range, and what moves the target."),
      ("Why did it change?", "The variance explainer names the drivers of a change between versions or periods, by every dimension.")],
     "Sample data. The same widgets run on live S/4HANA data.")

# ---- fourth picture: on a phone (three phone screens next to the points) ----
def phone_page(name, height):
    css = CSS.replace("HEIGHT", str(height)) + """
.phones{position:relative;display:flex;gap:26px;align-items:flex-start}
.phone{width:290px;border-radius:44px;padding:11px;background:linear-gradient(160deg,#1b2b33,#0a1418);box-shadow:0 30px 70px rgba(0,0,0,.45),inset 0 0 0 2px rgba(255,255,255,.18)}
.phone .scr{border-radius:34px;overflow:hidden;background:#111;aspect-ratio:750/1624}
.phone img{width:100%;height:100%;display:block;object-fit:cover}
.phone.mid{margin-top:34px}
.cap{margin-top:12px;text-align:center;font-size:16px;color:#d6e6e9;font-weight:600}
.row{position:relative;display:flex;gap:34px;padding:30px 56px 0;align-items:flex-start}
.side{flex:1;display:flex;flex-direction:column;gap:18px;padding-top:6px}
.side .chip{padding:20px 24px}
"""
    def ph(img, cap, cls=""):
        return f"<div><div class='phone {cls}'><div class='scr'><img src='file://{IMG}/{img}'></div></div><div class='cap'>{cap}</div></div>"
    h = f"<html><head><meta charset='utf-8'><style>{css}</style></head><body>"
    h += "<div class='orb o1'></div><div class='orb o2'></div><div class='orb o3'></div>"
    h += "<div class='wrap'><div class='badge'><span class='pill'>SAC Lite</span><span class='eb'>Analytics and planning on Fiori</span></div><h1>Open it on your phone</h1>"
    h += "<div class='sub'>The same app, the same data, in the browser of your phone. No extra app to install.</div></div>"
    h += "<div class='row'><div class='side'>"
    for t, d in [("Fits the screen", "Widgets stack in one column, charts resize, dialogs and designers stack instead of squeezing."),
                 ("One thumb", "A floating menu button opens the pages in the order of the work. Drag it out of the way."),
                 ("Same launchpad", "Opens from the Fiori launchpad tile, under your own S/4HANA login and authorizations.")]:
        h += f"<div class='chip glass'><b>{t}</b><span>{d}</span></div>"
    h += "</div><div class='phones'>"
    h += ph("phone-story-kpi.jpg", "Story with KPIs") + ph("phone-story-charts.jpg", "Charts", "mid") + ph("phone-menu.jpg", "Floating menu")
    h += "</div></div><div class='foot' style='padding-top:22px'><span>Checked at phone width (375 px) in the browser and opened on a real phone.</span><span>SAC Lite is a custom application on SAP S/4HANA Cloud</span></div></body></html>"
    path = os.path.join(tempfile.gettempdir(), name + ".html")
    open(path, "w").write(h)
    out = os.path.join(IMG, name + ".png")
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=12000", f"--window-size=1400,{height}",
                    "--allow-file-access-from-files", f"--screenshot={out}", "file://" + path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print("written", out)

phone_page("email-4-phone", 1010)
