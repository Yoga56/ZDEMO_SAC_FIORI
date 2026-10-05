import subprocess, shutil
from PIL import Image
D="/Users/alexanderkresnayogatama/Downloads/SAP_BUILD/ZSAC_FIORI/sap/docs/img/diagrams/"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for n,w,h in [("architecture",1260,670),("sources",1170,470),("landscape",1170,500)]:
    shutil.copy(D+n+".svg","/tmp/deckdiag/"+n+".svg")
    open(f"/tmp/deckdiag/{n}.html","w").write(f"<html><body style='margin:0;background:#fff'><img src='{n}.svg' style='display:block'></body></html>")
    subprocess.run([CH,"--headless","--disable-gpu","--hide-scrollbars","--force-device-scale-factor=2",f"--window-size={w},{h+120}",f"--screenshot=/tmp/deckdiag/{n}-full.png",f"file:///tmp/deckdiag/{n}.html"],capture_output=True)
    Image.open(f"/tmp/deckdiag/{n}-full.png").crop((0,0,w*2,h*2)).save(D+n+".png")
