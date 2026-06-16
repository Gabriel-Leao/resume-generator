from flask import Flask, render_template, request, jsonify, send_file
import json, os, uuid, socket, tempfile
from datetime import datetime, timezone, timedelta
from engine import build

app = Flask(__name__)
DATA_FILE = "data.json"
TRASH_RETENTION_DAYS = 30

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            data = json.load(f)
    else:
        data = {"profiles": []}
    data.setdefault("trash", [])
    return data

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def purge_expired_trash(data):
    """"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)
    kept = []
    changed = False
    for item in data.get("trash", []):
        deleted_at = item.get("deleted_at")
        try:
            ts = datetime.fromisoformat(deleted_at)
        except (TypeError, ValueError):
            ts = None
        if ts is not None and ts < cutoff:
            changed = True
            continue
        kept.append(item)
    if changed:
        data["trash"] = kept
        save_data(data)
    return data

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/profiles", methods=["GET"])
def get_profiles():
    data = purge_expired_trash(load_data())
    return jsonify(data["profiles"])

@app.route("/api/profiles", methods=["POST"])
def save_profile():
    data    = load_data()
    profile = request.json
    if not profile.get("id"):
        profile["id"] = str(uuid.uuid4())[:8]
    existing = next((i for i, p in enumerate(data["profiles"]) if p["id"] == profile["id"]), None)
    if existing is not None:
        data["profiles"][existing] = profile
    else:
        data["profiles"].append(profile)
    save_data(data)
    return jsonify({"ok": True, "id": profile["id"]})

@app.route("/api/profiles/<pid>", methods=["DELETE"])
def delete_profile(pid):
    """"""
    data = load_data()
    profile = next((p for p in data["profiles"] if p["id"] == pid), None)
    if profile is None:
        return jsonify({"ok": False, "error": "Perfil não encontrado"}), 404
    data["profiles"] = [p for p in data["profiles"] if p["id"] != pid]
    trashed = dict(profile)
    trashed["deleted_at"] = datetime.now(timezone.utc).isoformat()
    data["trash"] = [t for t in data.get("trash", []) if t["id"] != pid] + [trashed]
    save_data(data)
    return jsonify({"ok": True})

@app.route("/api/trash", methods=["GET"])
def get_trash():
    data = purge_expired_trash(load_data())
    return jsonify(data.get("trash", []))

@app.route("/api/trash/<pid>/restore", methods=["POST"])
def restore_profile(pid):
    data = purge_expired_trash(load_data())
    item = next((t for t in data.get("trash", []) if t["id"] == pid), None)
    if item is None:
        return jsonify({"ok": False, "error": "Item não encontrado na lixeira"}), 404
    restored = dict(item)
    restored.pop("deleted_at", None)
    data["trash"] = [t for t in data["trash"] if t["id"] != pid]

    if any(p["id"] == restored["id"] for p in data["profiles"]):
        restored["id"] = str(uuid.uuid4())[:8]
    data["profiles"].append(restored)
    save_data(data)
    return jsonify({"ok": True, "id": restored["id"]})

@app.route("/api/trash/<pid>", methods=["DELETE"])
def delete_trash_permanently(pid):
    data = load_data()
    before = len(data.get("trash", []))
    data["trash"] = [t for t in data.get("trash", []) if t["id"] != pid]
    if len(data["trash"]) == before:
        return jsonify({"ok": False, "error": "Item não encontrado na lixeira"}), 404
    save_data(data)
    return jsonify({"ok": True})

@app.route("/api/fonts")
def list_fonts():
    """"""
    import re
    fonts_dir = "fonts"
    families = set()
    if os.path.isdir(fonts_dir):
        for fn in os.listdir(fonts_dir):
            if fn.lower().endswith(".ttf"):
                name = os.path.splitext(fn)[0]
                name = re.sub(r"[-_](Bold|Italic|Regular|Light|Medium|SemiBold|Black|Thin|ExtraLight|ExtraBold).*$", "", name, flags=re.IGNORECASE)
                families.add(name)
    return jsonify(sorted(families))

@app.route("/api/generate", methods=["POST"])
def generate():
    body       = request.json
    profile    = body["profile"]
    show_badge = body.get("show_badge", True)
    lang       = body.get("lang", "pt")
    name       = profile.get("name", "resume").replace(" ", "_")
    lc         = (profile.get("lang_contents") or {}).get(lang) or (profile.get("lang_contents") or {}).get("pt") or {}
    version    = lc.get("version") or profile.get("version", "cv") or "cv"
    filename   = f"{name}_{version}.pdf"
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    try:
        build(profile, tmp.name, show_badge=show_badge, lang=lang)
        return send_file(
            tmp.name,
            as_attachment=True,
            download_name=filename,
            mimetype="application/pdf",
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

def find_free_port(start=5000, max_attempts=10):
    for port in range(start, start + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                continue
    raise OSError(f"No free port found between {start} and {start + max_attempts - 1}")

if __name__ == "__main__":
    port = find_free_port(5000)
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        print(f"✅  Abrindo em http://localhost:{port}")
    app.run(host="0.0.0.0", debug=True, port=port)
