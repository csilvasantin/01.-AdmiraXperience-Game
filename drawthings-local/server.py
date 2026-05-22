#!/usr/bin/env python3
import json
import os
import random
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = os.environ.get("DRAWTHINGS_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("DRAWTHINGS_BRIDGE_PORT", "7869"))
MODEL = os.environ.get("DRAWTHINGS_MODEL", "flux_2_klein_4b_q6p.ckpt")
CLI = os.environ.get("DRAWTHINGS_CLI", "draw-things-cli")
ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.environ.get("DRAWTHINGS_OUTPUT_DIR", ROOT / "outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ORIGINS = {
    "https://www.admira.studio",
    "https://admira.studio",
    "https://csilvasantin.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
}


def cors_origin(origin):
    if origin in ALLOWED_ORIGINS:
        return origin
    if origin.startswith(("http://localhost:", "http://127.0.0.1:", "http://[::1]:")):
        return origin
    return "https://www.admira.studio"


def safe_dimension(value, fallback):
    try:
        n = int(value or fallback)
    except (TypeError, ValueError):
        n = fallback
    return round(max(512, min(1536, n)) / 64) * 64


def safe_seed(value):
    try:
        return abs(int(value)) % 2147483647
    except (TypeError, ValueError):
        return random.randint(0, 2147483646)


class Handler(BaseHTTPRequestHandler):
    server_version = "AdmiraDrawThingsBridge/1.0"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", cors_origin(self.headers.get("Origin", "")))
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"ok": True, "model": MODEL, "cli": CLI, "outputDir": str(OUTPUT_DIR)})
            return
        if parsed.path.startswith("/outputs/"):
            self.serve_output(parsed.path)
            return
        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if urlparse(self.path).path != "/generate":
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 64 * 1024)
            body = json.loads(self.rfile.read(length) or b"{}")
            self.generate(body)
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def serve_output(self, request_path):
        filename = Path(unquote(request_path.replace("/outputs/", "", 1))).name
        target = OUTPUT_DIR / filename
        if not filename or not target.exists():
            self.send_json(404, {"ok": False, "error": "not_found"})
            return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(data)

    def generate(self, body):
        prompt = str(body.get("prompt", "")).strip()
        if not prompt:
            self.send_json(400, {"ok": False, "error": "missing_prompt"})
            return
        width = safe_dimension(body.get("width"), 1344)
        height = safe_dimension(body.get("height"), 768)
        steps = max(8, min(60, int(body.get("steps") or 24)))
        seed = safe_seed(body.get("seed"))
        model = str(body.get("model") or MODEL)
        filename = f"admira-drawthings-{int(time.time() * 1000)}-{seed}.png"
        output = OUTPUT_DIR / filename
        args = [
            CLI, "generate",
            "--model", model,
            "--prompt", prompt,
            "--negative-prompt", str(body.get("negativePrompt") or "low quality, blurry, watermark, logo, text artifacts"),
            "--width", str(width),
            "--height", str(height),
            "--steps", str(steps),
            "--seed", str(seed),
            "--output", str(output),
            "--disable-preview",
        ]
        result = subprocess.run(args, check=False, text=True, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or f"draw-things-cli exited {result.returncode}").strip())
        self.send_json(200, {
            "ok": True,
            "filename": filename,
            "url": f"http://{HOST}:{PORT}/outputs/{filename}",
            "model": model,
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed,
        })


if __name__ == "__main__":
    print(f"Draw Things bridge listening on http://{HOST}:{PORT}", flush=True)
    print(f"Model: {MODEL}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
