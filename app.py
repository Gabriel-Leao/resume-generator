"""
Resume Generator — Flask web app
Run: python app.py
Open: http://localhost:5000
"""

from flask import Flask, render_template, request, jsonify, send_file
import json, os, uuid, socket, tempfile
from engine import build

app = Flask(__name__)
DATA_FILE = "data.json"


def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return {"profiles": []}


def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/profiles", methods=["GET"])
def get_profiles():
    return jsonify(load_data()["profiles"])


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
    data = load_data()
    data["profiles"] = [p for p in data["profiles"] if p["id"] != pid]
    save_data(data)
    return jsonify({"ok": True})


@app.route("/api/generate", methods=["POST"])
def generate():
    body       = request.json
    profile    = body["profile"]
    show_badge = body.get("show_badge", True)
    name       = profile.get("name", "resume").replace(" ", "_")
    version    = profile.get("version", "cv") or "cv"
    filename   = f"{name}_{version}.pdf"

    # Write to a temp file, stream to browser, then delete — nothing stays on disk
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    try:
        build(profile, tmp.name, show_badge=show_badge)
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
