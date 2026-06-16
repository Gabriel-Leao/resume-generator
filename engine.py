from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import date
import os, re

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

_registered_fonts: dict = {}
_fonts_registered = False

def _register_family(family: str) -> tuple[str, str, str]:
    """
    Register a font family for ReportLab and return the three internal names
    (regular, bold, italic). Caches registrations so we don't re-register.
    """
    if family in _registered_fonts:
        return _registered_fonts[family]

    slug = re.sub(r"[^a-zA-Z0-9]", "_", family)
    r_name  = f"{slug}_R"
    rb_name = f"{slug}_RB"
    ri_name = f"{slug}_RI"

    try:
        variants = _find_font_variants_local(family)
        if not variants:
            variants = _find_font_variants_system(family)
        if not variants:
            raise FileNotFoundError(f"Font '{family}' not found")

        pdfmetrics.registerFont(TTFont(r_name,  variants["regular"]))
        pdfmetrics.registerFont(TTFont(rb_name, variants["bold"]))
        pdfmetrics.registerFont(TTFont(ri_name, variants["italic"]))
    except Exception:
        return _get_default_fonts()

    _registered_fonts[family] = (r_name, rb_name, ri_name)
    return r_name, rb_name, ri_name

def _find_font_variants_local(family: str) -> dict | None:
    """Look for Regular/Bold/Italic files in fonts/ folder matching the family."""
    if not os.path.isdir("fonts"):
        return None
    slug = family.replace(" ", "").replace("-", "")
    files = {f.lower(): f for f in os.listdir("fonts") if f.endswith((".ttf", ".otf"))}
    result = {}
    for variant, keywords in {
        "regular": [f"{slug.lower()}-regular", f"{slug.lower()}_regular", f"{slug.lower()}regular",
                    f"{slug.lower()}-400",     f"{slug.lower()}"],
        "bold":    [f"{slug.lower()}-bold",    f"{slug.lower()}_bold",    f"{slug.lower()}bold",
                    f"{slug.lower()}-700"],
        "italic":  [f"{slug.lower()}-italic",  f"{slug.lower()}_italic",  f"{slug.lower()}italic",
                    f"{slug.lower()}-regularitalic", f"{slug.lower()}-400italic"],
    }.items():
        for kw in keywords:
            for fname_lower, fname in files.items():
                base = os.path.splitext(fname_lower)[0]
                if base == kw or base.startswith(kw):
                    result[variant] = os.path.join("fonts", fname)
                    break
            if variant in result:
                break
    if len(result) < 3:
        return None
    return result

def _find_font_variants_system(family: str) -> dict | None:
    """Use fc-match to find Regular/Bold/Italic system font files."""
    import subprocess
    result = {}
    for variant, fc_style in {
        "regular": "Regular",
        "bold":    "Bold",
        "italic":  "Italic",
    }.items():
        try:
            out = subprocess.check_output(
                ["fc-match", f"{family}:style={fc_style}", "--format=%{file}"],
                text=True, stderr=subprocess.DEVNULL
            ).strip()
            if out and (out.endswith(".ttf") or out.endswith(".otf")):
                verify = subprocess.check_output(
                    ["fc-match", f"{family}:style={fc_style}", "--format=%{family}"],
                    text=True, stderr=subprocess.DEVNULL
                ).strip().split(",")[0].strip().lower()
                if family.lower() in verify or verify in family.lower():
                    result[variant] = out
        except (FileNotFoundError, subprocess.CalledProcessError):
            pass
    return result if len(result) == 3 else None

def _get_default_fonts() -> tuple[str, str, str]:
    """Register and return the default Liberation Sans / Inter fonts."""
    global _fonts_registered
    if not _fonts_registered:
        use_inter = os.path.exists("fonts/Inter-Regular.ttf")
        pdfmetrics.registerFont(TTFont("R",  _find_font("Inter-Regular.ttf")  if use_inter else _find_font("LiberationSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("RB", _find_font("Inter-Bold.ttf")     if use_inter else _find_font("LiberationSans-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("RI", _find_font("Inter-Italic.ttf")   if use_inter else _find_font("LiberationSans-Italic.ttf")))
        _fonts_registered = True
    return "R", "RB", "RI"

def ensure_fonts():
    _get_default_fonts()

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
KEEP_WITH_HEADER = 2

def build(data, output_path, show_badge=True, lang="pt"):
    # Flatten lang_contents into data so rest of engine works unchanged
    if "lang_contents" in data:
        lc = data["lang_contents"].get(lang) or data["lang_contents"].get("pt") or {}
        data = {**data, **lc}
    ensure_fonts()
    family = data.get("font_family", "").strip()
    if family:
        FR, FRB, FRI = _register_family(family)
    else:
        FR, FRB, FRI = _get_default_fonts()
    ACCENT = colors.HexColor(data.get("theme_accent", "#1B3A6B"))
    BODY   = colors.HexColor(data.get("theme_body",   "#111111"))
    MUTED  = colors.HexColor(data.get("theme_muted",  "#555555"))
    WHITE  = colors.white
    FS_BODY  = float(data.get("font_size_body",  data.get("font_size", 9)))
    FS_TITLE = float(data.get("font_size_title", FS_BODY * 2.4))

    PAGE_W, _ = letter
    MX     = 0.55 * inch
    MY     = 0.50 * inch
    CW     = PAGE_W - 2 * MX
    INDENT = 0.30 * inch
    FS     = FS_BODY

    def s(name, **kw):
        d = dict(fontName=FR, fontSize=FS_BODY, textColor=BODY, leading=FS_BODY * 1.45,
                 spaceAfter=0, spaceBefore=0, alignment=TA_LEFT)
        d.update(kw)
        return ParagraphStyle(name, **d)

    ST = {
        "name":     s("name",  fontName=FRB, fontSize=FS_TITLE, textColor=ACCENT,
                      alignment=TA_CENTER, leading=FS_TITLE * 1.3, spaceAfter=3),
        "contact":  s("con",   fontSize=FS_BODY * 0.94, textColor=MUTED, alignment=TA_CENTER, leading=FS_BODY * 1.45),
        "links":    s("lnk",   fontSize=FS_BODY * 0.94, textColor=ACCENT, alignment=TA_CENTER, leading=FS_BODY * 1.45),
        "section":  s("sec",   fontName=FRB, fontSize=FS_BODY * 1.05, textColor=ACCENT, spaceBefore=2, spaceAfter=2),
        "body":     s("body",  leading=FS_BODY * 1.45, alignment=TA_JUSTIFY),
        "bold":     s("bold",  fontName=FRB),
        "jobtitle": s("jt",    fontName=FRB, fontSize=FS_BODY * 1.05),
        "company":  s("co",    fontName=FRI, fontSize=FS_BODY * 0.94, textColor=MUTED),
        "date":     s("dt",    fontSize=FS_BODY * 0.88, textColor=MUTED, leading=FS_BODY * 1.35),
        "bullet":   s("bul",   leading=FS_BODY * 1.45, leftIndent=10, alignment=TA_JUSTIFY),
        "status":   s("sts",   fontName=FRI, fontSize=FS_BODY * 0.94, textColor=MUTED),
        "projlink": s("pl",    fontName=FRI, fontSize=FS_BODY * 0.85, textColor=ACCENT, spaceBefore=1, spaceAfter=0),
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

        def __init__(self, text, fs=7.5):
            super().__init__()
            self._text = text
            self._fs   = fs
            self._font = FRB
            self.hAlign = "LEFT"

        def wrap(self, aw, ah):
            self._h = self._fs + 2 * self.PY
            return self.WIDTH, self._h

        def draw(self):
            c = self.canv
            c.saveState()
            c.setFillColor(ACCENT)
            c.roundRect(0, 0, self.WIDTH, self._h, self.RADIUS, stroke=0, fill=1)
            c.setFillColor(WHITE)
            c.setFont(self._font, self._fs)
            c.drawCentredString(self.WIDTH / 2, self.PY + 0.5, self._text)
            c.restoreState()

    def date_para(text):
        return Paragraph(text, ParagraphStyle("dl", parent=ST["date"], leftIndent=0))

    def bul(text):
        return Paragraph(f"• {text}", ST["bullet"])

    def job_row(job):
        """Build the two-column row for a single job."""
        duration  = calc_duration(job["start_date"], job.get("end_date") or None)
        end_label = "Atual" if not job.get("end_date") else job["end_date"]
        JL        = 1.3 * inch
        left_col  = [Badge(duration, FS * 0.83), sp(3), date_para(f'{job["start_date"]} - {end_label}')] \
                    if show_badge else [date_para(f'{job["start_date"]} - {end_label}')]
        row = Table([[
            left_col,
            [Paragraph(job["title"], ST["jobtitle"]),
             Paragraph(f'{job["company"]} · {job["location"]}', ST["company"]),
             sp(3),
             *[bul(b) for b in job["bullets"]]]
        ]], colWidths=[JL, CW - INDENT - JL])
        row.setStyle(NO_STYLE)
        return iblock(row)

    def edu_row(edu):
        EL  = 1.3 * inch
        row = Table([[
            [Paragraph(edu["dates"], ST["date"])],
            [Paragraph(edu["degree"], ST["bold"]),
             Paragraph(edu["institution"], ST["company"]),
             Paragraph(f'Status · {edu["status"]}', ST["status"])]
        ]], colWidths=[EL, CW - INDENT - EL])
        row.setStyle(NO_STYLE)
        return iblock(row)
    def section_blocks(header_el, items, spacer_between=6, trailing_spacer=5):
        """
        Returns a list of flowables for a section, applying KeepTogether
        so the header always stays with at least KEEP_WITH_HEADER items.
        Items beyond that threshold may flow freely across pages.
        """
        if not items:
            return [header_el, sp(trailing_spacer), divider()]

        flowables = []
        anchor = [header_el]
        for item in items[:KEEP_WITH_HEADER]:
            anchor.append(item)
        flowables.append(KeepTogether(anchor))
        for item in items[KEEP_WITH_HEADER:]:
            flowables.append(KeepTogether([sp(spacer_between), item]))

        flowables += [sp(trailing_spacer), divider()]
        return flowables
    story = []
    accent_hex = data.get("theme_accent", "#1B3A6B")
    story.append(KeepTogether([
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
    ]))
    story.append(KeepTogether([
        hdr("Resumo Profissional"),
        iblock(Paragraph(data["resumo"], ST["body"])),
        sp(5), divider(),
    ]))
    exp_items = [job_row(job) for job in data["experience"]]
    story += section_blocks(hdr("Histórico Profissional"), exp_items, spacer_between=6)
    techs = data.get("technologies", [])
    if techs and isinstance(techs[0], dict):
        tech_items = []
        for g in techs:
            if not g.get("items"):
                continue
            items_str = "  ".join(g["items"])
            tech_items.append(Paragraph(f'<b>{g.get("title","")}</b>  {items_str}', ST["body"]))
    else:
        tech_items = [bul(t) for t in techs]
    if tech_items:
        story.append(KeepTogether([
            hdr("Tecnologias"),
            iblock(tech_items),
            sp(5), divider(),
        ]))
    edu_items = [edu_row(edu) for edu in data["education"]]
    story += section_blocks(hdr("Formação Acadêmica"), edu_items, spacer_between=4)
    skills_raw = data.get("skills", [])
    if skills_raw and isinstance(skills_raw[0], dict):
        flat_skills = [s for g in skills_raw for s in g.get("items", [])]
    else:
        flat_skills = [s for s in skills_raw if isinstance(s, str)]
    if flat_skills:
        half = len(flat_skills) // 2 + len(flat_skills) % 2
        inner = Table(
            [[[bul(s) for s in flat_skills[:half]],
              [bul(s) for s in flat_skills[half:]]]],
            colWidths=[(CW - INDENT) / 2, (CW - INDENT) / 2]
        )
        inner.setStyle(NO_STYLE)
        story.append(KeepTogether([
            hdr("Habilidades e Competências"),
            iblock([inner]),
            sp(5), divider(),
        ]))
    projects = data.get("projects", [])
    if projects:
        proj_items = []
        for pr in projects:
            if not pr.get("name"):
                continue
            proj_items.append(Paragraph(pr["name"], ST["jobtitle"]))
            if pr.get("description"):
                proj_items.append(Paragraph(pr["description"], ST["body"]))
            links = [l for l in pr.get("links", []) if l.get("url")]
            if links:
                links_html = '  <font color="#999999">·</font>  '.join(
                    f'<link href="{l["url"]}"><u>{l.get("label") or l["url"]}</u></link>'
                    for l in links
                )
                proj_items.append(Paragraph(links_html, ST["projlink"]))
            proj_items.append(sp(4))
        story.append(KeepTogether([
            hdr("Projetos"),
            iblock(proj_items),
            sp(5), divider(),
        ]))
    story.append(KeepTogether([
        hdr("Idiomas"),
        iblock([Paragraph(l, ST["body"]) for l in data["languages"]]),
    ]))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = SimpleDocTemplate(output_path, pagesize=letter,
                            leftMargin=MX, rightMargin=MX,
                            topMargin=MY, bottomMargin=MY)
    doc.build(story)
