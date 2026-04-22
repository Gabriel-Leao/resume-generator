"""
PDF generation engine — called by app.py, not run directly.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import date
import os

# ── Font registration ──────────────────────────────────────────────────────────

def _find_font(name):
    local = os.path.join("fonts", name)
    if os.path.exists(local):
        return local
    for path in [
        f"/usr/share/fonts/truetype/liberation/{name}",
        f"/Library/Fonts/{name}",
        f"C:/Windows/Fonts/{name}",
    ]:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(
        f"Font '{name}' not found. "
        "Download Inter from https://rsms.me/inter/ and put the .ttf files in fonts/"
    )

_fonts_registered = False

def ensure_fonts():
    global _fonts_registered
    if _fonts_registered:
        return
    pdfmetrics.registerFont(TTFont("R",  _find_font("Inter-Regular.ttf")  if os.path.exists("fonts/Inter-Regular.ttf")  else _find_font("LiberationSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("RB", _find_font("Inter-Bold.ttf")     if os.path.exists("fonts/Inter-Bold.ttf")     else _find_font("LiberationSans-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("RI", _find_font("Inter-Italic.ttf")   if os.path.exists("fonts/Inter-Italic.ttf")   else _find_font("LiberationSans-Italic.ttf")))
    _fonts_registered = True

# ── Duration calculator ────────────────────────────────────────────────────────

def calc_duration(start_str, end_str=None):
    def parse(s):
        m, y = s.strip().split("/")
        return date(int(y), int(m), 1)
    start  = parse(start_str)
    end    = date.today() if (not end_str or end_str.strip().lower() == "atual") else parse(end_str)
    months = max((end.year - start.year) * 12 + (end.month - start.month) + 1, 1)
    years, rem = months // 12, months % 12
    if years == 0:
        return f"{rem} {'mês' if rem == 1 else 'meses'}"
    elif rem == 0:
        return f"{years} {'ano' if years == 1 else 'anos'}"
    else:
        return f"{years} {'ano' if years == 1 else 'anos'} e {rem} {'mês' if rem == 1 else 'meses'}"

# ── Build ──────────────────────────────────────────────────────────────────────

def build(data, output_path, show_badge=True):
    """
    data: dict with resume fields (from data.json profile)
    output_path: where to save the PDF
    show_badge: whether to show the duration badge
    """
    ensure_fonts()

    ACCENT = colors.HexColor(data.get("theme_accent", "#1B3A6B"))
    BODY   = colors.HexColor(data.get("theme_body",   "#111111"))
    MUTED  = colors.HexColor(data.get("theme_muted",  "#555555"))
    WHITE  = colors.white

    PAGE_W, _ = letter
    MX     = 0.55 * inch
    MY     = 0.50 * inch
    CW     = PAGE_W - 2 * MX
    FS     = 9
    INDENT = 0.30 * inch

    def s(name, **kw):
        d = dict(fontName="R", fontSize=FS, textColor=BODY, leading=FS * 1.4,
                 spaceAfter=0, spaceBefore=0, alignment=TA_LEFT)
        d.update(kw)
        return ParagraphStyle(name, **d)

    ST = {
        "name":     s("name",  fontName="RB", fontSize=22, textColor=ACCENT,
                      alignment=TA_CENTER, leading=28, spaceAfter=3),
        "contact":  s("con",   fontSize=8.5, textColor=MUTED, alignment=TA_CENTER, leading=13),
        "links":    s("lnk",   fontSize=8.5, textColor=ACCENT, alignment=TA_CENTER, leading=13),
        "section":  s("sec",   fontName="RB", fontSize=9.5, textColor=ACCENT, spaceBefore=2, spaceAfter=2),
        "body":     s("body",  leading=13, alignment=TA_JUSTIFY),
        "bold":     s("bold",  fontName="RB"),
        "jobtitle": s("jt",    fontName="RB", fontSize=9.5),
        "company":  s("co",    fontName="RI", fontSize=8.5, textColor=MUTED),
        "date":     s("dt",    fontSize=8, textColor=MUTED, leading=12),
        "bullet":   s("bul",   leading=13, leftIndent=10, alignment=TA_JUSTIFY),
        "status":   s("sts",   fontName="RI", fontSize=8.5, textColor=MUTED),
    }

    NO_STYLE = TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ])

    def sp(h=4): return Spacer(1, h)

    def divider():
        return HRFlowable(width="100%", thickness=0.5,
                          color=colors.HexColor("#AAAAAA"),
                          dash=(2, 3), spaceAfter=4, spaceBefore=4)

    def hdr(text):
        return Paragraph(text.upper(), ST["section"])

    def iblock(content):
        if not isinstance(content, list):
            content = [content]
        t = Table([[sp(1), content]], colWidths=[INDENT, CW - INDENT])
        t.setStyle(NO_STYLE)
        return t

    class Badge(Flowable):
        RADIUS = 3
        PY = 4
        WIDTH = 1.15 * inch
        FS = 7.5
        def __init__(self, text):
            super().__init__()
            self._text = text
            self.hAlign = "LEFT"
        def wrap(self, aw, ah):
            self._h = self.FS + 2 * self.PY
            return self.WIDTH, self._h
        def draw(self):
            c = self.canv
            c.saveState()
            c.setFillColor(ACCENT)
            c.roundRect(0, 0, self.WIDTH, self._h, self.RADIUS, stroke=0, fill=1)
            c.setFillColor(WHITE)
            c.setFont("RB", self.FS)
            c.drawCentredString(self.WIDTH / 2, self.PY + 0.5, self._text)
            c.restoreState()

    def date_para(text):
        return Paragraph(text, ParagraphStyle("dl", parent=ST["date"], leftIndent=0))

    def bul(text):
        return Paragraph(f"• {text}", ST["bullet"])

    # ── Story ────────────────────────────────────────────────
    story = []

    # Header
    accent_hex = data.get("theme_accent", "#1B3A6B")
    story += [
        Paragraph(data["name"], ST["name"]),
        sp(2),
        Paragraph(data["location"], ST["contact"]),
        Paragraph(f'{data["phone"]} · {data["email"]}', ST["contact"]),
        Paragraph(
            f'<a href="{data["linkedin_url"]}" color="{accent_hex}"><u>{data["linkedin_label"]}</u></a>'
            f'&nbsp;&nbsp;&nbsp;&nbsp;'
            f'<a href="{data["github_url"]}" color="{accent_hex}"><u>{data["github_label"]}</u></a>',
            ST["links"]
        ),
        sp(5), divider(),
    ]

    # Resumo
    story += [
        hdr("Resumo Profissional"),
        iblock(Paragraph(data["resumo"], ST["body"])),
        sp(5), divider(),
    ]

    # Experiência
    story.append(hdr("Histórico Profissional"))
    for i, job in enumerate(data["experience"]):
        if i > 0:
            story.append(sp(6))
        duration  = calc_duration(job["start_date"], job.get("end_date") or None)
        end_label = "Atual" if not job.get("end_date") else job["end_date"]
        JL = 1.3 * inch
        left_col = [Badge(duration), sp(3), date_para(f'{job["start_date"]} - {end_label}')] if show_badge \
               else [date_para(f'{job["start_date"]} - {end_label}')]
        row = Table([[
            left_col,
            [Paragraph(job["title"], ST["jobtitle"]),
             Paragraph(f'{job["company"]} · {job["location"]}', ST["company"]),
             sp(3),
             *[bul(b) for b in job["bullets"]]]
        ]], colWidths=[JL, CW - INDENT - JL])
        row.setStyle(NO_STYLE)
        story.append(iblock(row))
    story += [sp(5), divider()]

    # Tecnologias
    story += [
        hdr("Tecnologias"),
        iblock([bul(t) for t in data["technologies"]]),
        sp(5), divider(),
    ]

    # Formação
    story.append(hdr("Formação Acadêmica"))
    for i, edu in enumerate(data["education"]):
        if i > 0:
            story.append(sp(4))
        EL = 1.3 * inch
        row = Table([[
            [Paragraph(edu["dates"], ST["date"])],
            [Paragraph(edu["degree"], ST["bold"]),
             Paragraph(edu["institution"], ST["company"]),
             Paragraph(f'Status · {edu["status"]}', ST["status"])]
        ]], colWidths=[EL, CW - INDENT - EL])
        row.setStyle(NO_STYLE)
        story.append(iblock(row))
    story += [sp(5), divider()]

    # Habilidades
    half  = len(data["skills"]) // 2 + len(data["skills"]) % 2
    inner = Table(
        [[[bul(s) for s in data["skills"][:half]],
          [bul(s) for s in data["skills"][half:]]]],
        colWidths=[(CW - INDENT) / 2, (CW - INDENT) / 2]
    )
    inner.setStyle(NO_STYLE)
    story += [hdr("Habilidades e Competências"), iblock(inner), sp(5), divider()]

    # Idiomas
    story += [
        hdr("Idiomas"),
        iblock([Paragraph(l, ST["body"]) for l in data["languages"]]),
    ]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = SimpleDocTemplate(output_path, pagesize=letter,
                            leftMargin=MX, rightMargin=MX,
                            topMargin=MY, bottomMargin=MY)
    doc.build(story)
