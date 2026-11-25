#!/usr/bin/env python3
"""Generate the default 1200x630 Open Graph image for every market into public/og/<cc>.jpg.

Uses only existing brand assets (logo.svg, trail-running.webp, self-hosted Montserrat / New Amsterdam).
Renders an HTML template with headless Chrome, then converts to JPEG.

  python3 scripts/generate_og_images.py [cc ...]      # default: all markets
Needs: google-chrome (or CHROME_BIN), PyYAML, Pillow.
"""
import html, os, subprocess, sys, tempfile
from pathlib import Path
import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'og'
CHROME = os.environ.get('CHROME_BIN', 'google-chrome')

TEMPLATE = """<!doctype html><html><head><meta charset="utf-8"><style>
@import url('file://{fonts}/og-fonts.css');
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1200px;height:630px;overflow:hidden}}
body{{position:relative;font-family:'Montserrat','Noto Sans','DejaVu Sans',sans-serif;background:#00492f;color:#fff}}
.photo{{position:absolute;inset:0;background:url('file://{photo}') center 35%/cover}}
.shade{{position:absolute;inset:0;background:linear-gradient(100deg,rgba(0,37,24,.96) 0%,rgba(0,73,47,.90) 48%,rgba(0,73,47,.45) 100%)}}
.content{{position:absolute;left:84px;top:0;bottom:0;right:84px;display:flex;flex-direction:column;justify-content:center}}
.logo{{width:132px;height:132px;border-radius:26px;background:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:46px;box-shadow:0 10px 30px rgba(0,0,0,.28)}}
.logo img{{width:108px;height:108px}}
.name{{font-family:'New Amsterdam','Montserrat','Noto Sans',sans-serif;font-size:{name_size}px;line-height:1.02;font-weight:400;letter-spacing:.5px}}
.bar{{width:120px;height:8px;border-radius:4px;background:#e2701b;margin:34px 0 30px}}
.tag{{font-size:44px;line-height:1.25;font-weight:600;max-width:900px}}
.tag b{{font-weight:700;color:#f4a261}}
.host{{position:absolute;left:84px;bottom:44px;font-size:26px;font-weight:500;color:rgba(255,255,255,.78);letter-spacing:.3px}}
</style></head><body><div class="photo"></div><div class="shade"></div>
<div class="content"><div class="logo"><img src="file://{logo}"></div>
<div class="name">{name}</div><div class="bar"></div>
<div class="tag">{lead} <b>{accent}</b></div></div>
<div class="host">{host}</div></body></html>"""


def parts(d):
    title = str(d.get('title') or '').strip()
    country = str(d.get('country_native') or '').strip()
    if country and title.lower().endswith(country.lower()):
        return title[: len(title) - len(country)].strip(), country
    return title, country


def main():
    wanted = set(a.lower() for a in sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    fonts_css = (ROOT / 'src/styles/fonts.css').read_text().replace("url('/fonts/", f"url('file://{ROOT}/public/fonts/")
    tmp = Path(tempfile.mkdtemp(prefix='og-'))
    (tmp / 'og-fonts.css').write_text(fonts_css)
    for idx in sorted((ROOT / 'data/countries').glob('*/index.yaml')):
        cc = idx.parent.name
        if wanted and cc not in wanted:
            continue
        d = yaml.safe_load(idx.read_text())
        name = str(d.get('page_name') or '').strip()
        lead, accent = parts(d)
        host = str(d.get('base_url') or '').replace('https://', '').replace('http://', '').strip('/')
        name_size = 112 if len(name) <= 14 else 92 if len(name) <= 20 else 76
        page = tmp / f'{cc}.html'
        page.write_text(TEMPLATE.format(
            fonts=tmp, photo=ROOT / 'public/common_images/trail-running.webp',
            logo=ROOT / 'public/common_images/logo.svg', name=html.escape(name), lead=html.escape(lead),
            accent=html.escape(accent), host=html.escape(host), name_size=name_size))
        png = tmp / f'{cc}.png'
        subprocess.run([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
                        '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=4000',
                        f'--screenshot={png}', f'file://{page}'], check=True, capture_output=True)
        img = Image.open(png).convert('RGB').crop((0, 0, 1200, 630))
        img.save(OUT / f'{cc}.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
        print(cc, (OUT / f'{cc}.jpg').stat().st_size)


if __name__ == '__main__':
    main()
