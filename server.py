#!/usr/bin/env python3
"""
Casium AI - local AI manager.

One process, standard library only. Serves the UI and talks to:
  * Ollama    - local model downloads + inference (http://127.0.0.1:11434)
  * MCP apps  - stdio JSON-RPC tools (github, filesystem, ...)
  * Skills    - SKILL.md instruction packs in the data folder

Run:  python3 server.py
"""

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_VERSION = "0.1.0"
HOST = "0.0.0.0"
PORT = int(os.environ.get("CASIUM_PORT", "8787"))

# ---------------------------------------------------------------- paths

DATA_DIR = Path(os.environ.get("CASIUM_HOME", str(Path.home() / ".casium-ai")))
CHATS_DIR = DATA_DIR / "chats"
SKILLS_DIR = DATA_DIR / "skills"
TMP_DIR = DATA_DIR / "tmp"
BUNDLED_SKILLS = Path(__file__).resolve().parent / "skills"
WEB_DIR = Path(__file__).resolve().parent / "web"

for d in (DATA_DIR, CHATS_DIR, SKILLS_DIR, TMP_DIR):
    d.mkdir(parents=True, exist_ok=True)

SETTINGS_FILE = DATA_DIR / "settings.json"
MCP_FILE = DATA_DIR / "mcp.json"
BUNDLED_SEED = DATA_DIR / "bundled_seed.json"

# ---------------------------------------------------------------- small helpers

def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default

def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

def now_ts():
    return int(time.time())

def human_size(n):
    n = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(n)} {unit}"
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

def sanitize_name(name):
    name = re.sub(r"[^a-zA-Z0-9_\-]+", "-", name.strip().lower())
    return re.sub(r"-{2,}", "-", name).strip("-") or "skill"

def http_json(url, payload=None, timeout=10, method=None):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method or ("POST" if data else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, {"error": body.strip()[:300]}

def http_stream(url, payload, timeout=15):
    """POST json to url, yield parsed NDJSON lines. Raises on connection error."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "Accept": "application/x-ndjson"},
        method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        while True:
            line = r.readline()
            if not line:
                break
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except ValueError:
                    continue

# ---------------------------------------------------------------- settings

def default_settings():
    return {
        "ollama_host": "http://127.0.0.1:11434",
        "theme": "paper",
        "default_model": "",
        "mcp_timeout": 60,
        "autostart_mcp": False,
    }

def get_settings():
    s = default_settings()
    s.update(load_json(SETTINGS_FILE, {}))
    return s

def save_settings(s):
    save_json(SETTINGS_FILE, s)

# ---------------------------------------------------------------- ollama client

class Ollama:
    def __init__(self):
        self._lock = threading.Lock()

    @property
    def base(self):
        host = get_settings()["ollama_host"].rstrip("/")
        if not host.startswith("http"):
            host = "http://" + host
        return host

    def status(self):
        try:
            code, body = http_json(self.base + "/api/version", timeout=3)
            if code == 200:
                return {"online": True, "version": body.get("version", "")}
        except (urllib.error.URLError, socket.timeout, OSError, ConnectionError):
            pass
        return {"online": False, "version": ""}

    def list_models(self):
        code, body = http_json(self.base + "/api/tags", timeout=5)
        if code != 200:
            return []
        out = []
        for m in body.get("models", []):
            out.append({
                "name": m.get("name", ""),
                "size": m.get("size", 0),
                "modified": m.get("modified_at", ""),
                "details": {
                    "parameter_size": (m.get("details") or {}).get("parameter_size"),
                    "family": (m.get("details") or {}).get("family"),
                    "quantization": (m.get("details") or {}).get("quantization"),
                },
            })
        out.sort(key=lambda x: x["name"])
        return out

    def pull_stream(self, name):
        for chunk in http_stream(self.base + "/api/pull", {"name": name}, timeout=600):
            yield chunk

    def delete(self, name):
        return http_json(self.base + "/api/tags", payload={"name": name}, timeout=10)

    def chat_stream(self, payload):
        for chunk in http_stream(self.base + "/api/chat", payload, timeout=3600):
            yield chunk

OLLAMA = Ollama()

# ---------------------------------------------------------------- skills

SKILL_FILE_RE = re.compile(r"skill\.md$", re.IGNORECASE)

def parse_frontmatter(text):
    """Tiny frontmatter parser: name / description / whatever, plus body."""
    meta, body = {}, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.DOTALL)
    if m:
        body = text[m.end():]
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip().strip('"').strip("'")
    return meta, body.strip()

def list_skills():
    skills = []
    if not SKILLS_DIR.is_dir():
        return skills
    for entry in sorted(SKILLS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        sf = next((p for p in entry.rglob("*") if p.is_file() and SKILL_FILE_RE.match(p.name)), None)
        if not sf:
            continue
        try:
            meta, body = parse_frontmatter(sf.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        skills.append({
            "name": meta.get("name") or entry.name,
            "dir": entry.name,
            "description": meta.get("description", "").strip(),
            "source": meta.get("source", "bundled"),
            "size": sum(p.stat().st_size for p in entry.rglob("*") if p.is_file()),
            "body_preview": body[:400],
        })
    # a skill is disabled when "<dir>.disabled" marker file exists next to it
    for s in skills:
        s["enabled"] = not (SKILLS_DIR / (s["dir"] + ".disabled")).exists()
    return skills

def seed_bundled_skills():
    """Copy bundled skills into the data dir once (kept so users can edit them)."""
    seed = load_json(BUNDLED_SEED, {"names": []})
    if not BUNDLED_SKILLS.is_dir():
        return
    for entry in BUNDLED_SKILLS.iterdir():
        if not entry.is_dir():
            continue
        dest = SKILLS_DIR / entry.name
        if not dest.exists() and entry.name not in seed.get("names", []):
            shutil.copytree(entry, dest)
            seed["names"].append(entry.name)
    save_json(BUNDLED_SEED, seed)

def toggle_skill(name, enabled):
    d = SKILLS_DIR / name
    marker = SKILLS_DIR / (name + ".disabled")
    if not d.is_dir():
        return False
    if enabled:
        marker.unlink(missing_ok=True)
    else:
        marker.touch()
    return True

def delete_skill(name):
    d = SKILLS_DIR / name
    if d.is_dir():
        shutil.rmtree(d)
    (SKILLS_DIR / (name + ".disabled")).unlink(missing_ok=True)
    return True

URL_RE = re.compile(r"https?://[^\s\)\]\"'<>,]+")
INSTALL_VERB_RE = re.compile(
    r"\b(install|add|import|fetch|grab|download|set ?up|load|get)\b.*\bskill|skill[s]?\b.*\b(install|add|import)\b",
    re.IGNORECASE)

def detect_skill_install(text):
    """If the user asked to install a skill and gave a URL, return the URL."""
    urls = URL_RE.findall(text)
    if not urls:
        return None
    if INSTALL_VERB_RE.search(text) or re.match(r"^\s*install\b", text, re.IGNORECASE):
        return urls[0].rstrip(".,;")
    return None

def find_skill_dirs(root):
    """Root is one skill, or contains skill subfolders (up to depth 3)."""
    root = Path(root)
    if (root / "SKILL.md").exists() or any(SKILL_FILE_RE.match(p.name) for p in root.iterdir() if p.is_file()):
        return [root]
    found = []
    for depth, start in ((0, root),):
        stack = [(root, 0)]
        while stack and len(found) < 24:
            cur, d = stack.pop()
            if d > 3:
                continue
            try:
                children = sorted(cur.iterdir())
            except OSError:
                continue
            if any(SKILL_FILE_RE.match(p.name) for p in children if p.is_file()):
                found.append(cur)
                continue
            for c in children:
                if c.is_dir() and c.name not in (".git", "node_modules", ".venv", "__pycache__"):
                    stack.append((c, d + 1))
    return found

def dir_size(path, cap=200 * 1024 * 1024):
    total = 0
    for p in Path(path).rglob("*"):
        if p.is_file():
            total += p.stat().st_size
            if total > cap:
                return total
    return total

def install_skill_from_url(url):
    """Clone url and install every skill found. Yields event dicts."""
    url = url.strip().strip('"').strip("'")
    if not re.match(r"^https?://", url):
        url = "https://" + url
    yield {"type": "action_step", "name": "install_skill", "step": "clone", "detail": url}
    work = Path(tempfile.mkdtemp(prefix="skill_", dir=TMP_DIR))
    try:
        proc = subprocess.run(
            ["git", "clone", "--depth", "1", "--quiet", url, str(work / "repo")],
            capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            msg = (proc.stderr or proc.stdout or "git clone failed").strip().splitlines()
            yield {"type": "action_step", "name": "install_skill", "step": "error",
                   "detail": msg[-1][:300] if msg else "git clone failed"}
            return
        repo = work / "repo"
        skill_dirs = find_skill_dirs(repo)
        if not skill_dirs:
            yield {"type": "action_step", "name": "install_skill", "step": "error",
                   "detail": "No SKILL.md found in that repository."}
            return
        yield {"type": "action_step", "name": "install_skill", "step": "found",
               "detail": f"{len(skill_dirs)} skill(s) found"}
        installed, taken = [], set()
        for sd in skill_dirs:
            if dir_size(sd) > 200 * 1024 * 1024:
                yield {"type": "action_step", "name": "install_skill", "step": "skip",
                       "detail": f"{sd.name} is too large"}
                continue
            sf = next(p for p in sd.rglob("*") if p.is_file() and SKILL_FILE_RE.match(p.name))
            meta, _ = parse_frontmatter(sf.read_text(encoding="utf-8", errors="replace"))
            name = sanitize_name(meta.get("name") or sd.name)
            while name in taken:
                name += "-2"
            taken.add(name)
            dest = SKILLS_DIR / name
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(sd, dest, ignore=shutil.ignore_patterns(".git", "node_modules"))
            # stamp source
            src_md = next(p for p in dest.rglob("*") if p.is_file() and SKILL_FILE_RE.match(p.name))
            text = src_md.read_text(encoding="utf-8", errors="replace")
            if "---" in text and "source:" not in text.split("---", 2)[1]:
                text = text.replace("---\n", f"---\nsource: {url}\n", 1)
            src_md.write_text(text, encoding="utf-8")
            installed.append(name)
            yield {"type": "action_step", "name": "install_skill", "step": "install",
                   "detail": name}
        yield {"type": "action_step", "name": "install_skill", "step": "done",
               "detail": "installed: " + ", ".join(installed) if installed else "nothing installed",
               "installed": installed}
    except subprocess.TimeoutExpired:
        yield {"type": "action_step", "name": "install_skill", "step": "error",
               "detail": "clone timed out after 5 minutes"}
    except Exception as e:  # noqa: BLE001
        yield {"type": "action_step", "name": "install_skill", "step": "error",
               "detail": str(e)[:300]}
    finally:
        shutil.rmtree(work, ignore_errors=True)

# ---------------------------------------------------------------- mcp

class McpServer:
    """One MCP server process speaking JSON-RPC over stdio."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.name = cfg["name"]
        self.state = "stopped"      # stopped | starting | running | error
        self.error = ""
        self.tools = []
        self.proc = None
        self._id = 0
        self._lock = threading.Lock()
        self._waiters = {}
        self._reader = None
        self._stderr_tail = []
        self._stopping = False

    # -- lifecycle

    def start(self, timeout=90):
        if self.state in ("running", "starting"):
            return
        self._stopping = False
        self.state = "starting"
        self.error = ""
        command = self.cfg.get("command", "")
        args = list(self.cfg.get("args") or [])
        env = dict(os.environ)
        env.update({k: str(v) for k, v in (self.cfg.get("env") or {}).items()})
        try:
            if os.name == "nt":
                line = " ".join([command] + args)
                self.proc = subprocess.Popen(line, shell=True, stdin=subprocess.PIPE,
                                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                             text=True, bufsize=1, env=env)
            else:
                self.proc = subprocess.Popen([command] + args, stdin=subprocess.PIPE,
                                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                             text=True, bufsize=1, env=env)
        except (OSError, FileNotFoundError) as e:
            self.state = "error"
            self.error = f"could not start: {e}"
            return
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        threading.Thread(target=self._stderr_loop, daemon=True).start()
        try:
            self._request("initialize", {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "Casium AI", "version": APP_VERSION},
            }, timeout=timeout)
            self._notify("notifications/initialized", {})
            res = self._request("tools/list", {}, timeout=30)
            self.tools = res.get("tools", [])
            self.state = "running"
        except McpError as e:
            self.state = "error"
            self.error = str(e)[:300]
            self.stop()

    def _read_loop(self):
        try:
            for line in self.proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                mid = msg.get("id")
                if mid is None:
                    continue
                with self._lock:
                    fut = self._waiters.pop(mid, None)
                if fut is not None:
                    if "error" in msg:
                        err = msg["error"]
                        fut.set_err(f"{err.get('message', 'error')}"[:300])
                    else:
                        fut.set_ok(msg.get("result", {}))
        except (OSError, ValueError):
            pass
        if not self._stopping and self.state == "running":
            self.state = "error"
            self.error = "server process exited"

    def _stderr_loop(self):
        try:
            for line in self.proc.stderr:
                self._stderr_tail.append(line.rstrip())
                if len(self._stderr_tail) > 80:
                    self._stderr_tail.pop(0)
        except OSError:
            pass

    def _write(self, obj):
        line = json.dumps(obj) + "\n"
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

    def _request(self, method, params, timeout=60):
        with self._lock:
            self._id += 1
            mid = self._id
            fut = _Future()
            self._waiters[mid] = fut
        self._write({"jsonrpc": "2.0", "id": mid, "method": method, "params": params})
        ok, val = fut.wait(timeout)
        if not ok:
            raise McpError(val)
        return val

    def _notify(self, method, params):
        try:
            self._write({"jsonrpc": "2.0", "method": method, "params": params})
        except OSError:
            pass

    def call_tool(self, tool, arguments, timeout=None):
        timeout = timeout or get_settings().get("mcp_timeout", 60)
        res = self._request("tools/call", {"name": tool, "arguments": arguments}, timeout=timeout)
        if res.get("isError"):
            raise McpError(self._extract(res)[:300])
        return self._extract(res)

    @staticmethod
    def _extract(res):
        parts = []
        for c in res.get("content", []) or []:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
            elif isinstance(c, str):
                parts.append(c)
        if not parts:
            return json.dumps(res)[:2000]
        return "\n".join(parts)[:20000]

    def stop(self):
        self._stopping = True
        self.state = "stopped"
        p = self.proc
        self.proc = None
        if p is None:
            return
        try:
            p.stdin.close()
        except OSError:
            pass
        try:
            p.terminate()
            p.wait(timeout=4)
        except Exception:  # noqa: BLE001
            try:
                p.kill()
            except OSError:
                pass

    def info(self):
        return {
            "name": self.name,
            "command": self.cfg.get("command", ""),
            "args": self.cfg.get("args") or [],
            "env": {k: ("*" * 6 if len(str(v)) > 4 else v) for k, v in (self.cfg.get("env") or {}).items()},
            "note": self.cfg.get("note", ""),
            "state": self.state,
            "error": self.error,
            "tools": len(self.tools),
        }


class McpError(Exception):
    pass


class _Future:
    def __init__(self):
        self._ev = threading.Event()
        self._ok = False
        self._val = None

    def set_ok(self, val):
        self._ok, self._val = True, val
        self._ev.set()

    def set_err(self, msg):
        self._ok, self._val = False, msg
        self._ev.set()

    def wait(self, timeout):
        self._ev.wait(timeout)
        if not self._ev.is_set():
            return False, "timed out"
        return self._ok, self._val


class McpRegistry:
    def __init__(self):
        self.servers = {}
        self._lock = threading.Lock()

    def load(self):
        cfgs = load_json(MCP_FILE, [])
        for cfg in cfgs:
            name = sanitize_name(cfg.get("name", ""))
            if not name:
                continue
            cfg["name"] = name
            self.servers[name] = McpServer(cfg)
        if get_settings().get("autostart_mcp"):
            for s in self.servers.values():
                if s.cfg.get("autostart", False):
                    threading.Thread(target=s.start, daemon=True).start()

    def save(self):
        save_json(MCP_FILE, [s.cfg for s in self.servers.values()])

    def add(self, cfg):
        name = sanitize_name(cfg.get("name", ""))
        if not name or not cfg.get("command"):
            raise ValueError("name and command are required")
        if name in self.servers:
            self.servers[name].stop()
            del self.servers[name]
        s = McpServer({
            "name": name,
            "command": cfg["command"].strip(),
            "args": [a.strip() for a in (cfg.get("args") or "").split() if a.strip()],
            "env": cfg.get("env") or {},
            "note": cfg.get("note", ""),
            "autostart": bool(cfg.get("autostart")),
        })
        self.servers[name] = s
        self.save()
        return s

    def get(self, name):
        return self.servers.get(name)

    def remove(self, name):
        s = self.servers.pop(name, None)
        if s:
            s.stop()
        self.save()
        return s is not None

    def all(self):
        return [s.info() for s in self.servers.values()]

    def running(self):
        return [s for s in self.servers.values() if s.state == "running"]

    def all_tools(self):
        """OpenAI-style tool defs for every running server, prefixed to avoid clashes."""
        tools, mapping = [], {}
        for s in self.running():
            for t in s.tools:
                fn_name = f"{s.name}__{sanitize_name(t.get('name', ''))}"
                fn_name = re.sub(r"[^a-zA-Z0-9_-]", "_", fn_name)
                schema = t.get("inputSchema") or {"type": "object", "properties": {}}
                tools.append({
                    "type": "function",
                    "function": {
                        "name": fn_name,
                        "description": t.get("description", "")[:500],
                        "parameters": schema,
                    },
                })
                mapping[fn_name] = (s, t.get("name", ""))
        return tools, mapping

    def call(self, fn_name, args, mapping):
        s, tool = mapping[fn_name]
        return s.call_tool(tool, args or {})


MCP = McpRegistry()

# ---------------------------------------------------------------- chat store

def chat_path(cid):
    return CHATS_DIR / f"{re.sub(r'[^a-zA-Z0-9_-]', '', cid)}.json"

def list_chats():
    out = []
    for p in CHATS_DIR.glob("*.json"):
        try:
            c = json.loads(p.read_text(encoding="utf-8"))
            out.append({"id": c["id"], "title": c.get("title", "Untitled"),
                        "updated": c.get("updated", 0), "model": c.get("model", "")})
        except (ValueError, OSError, KeyError):
            continue
    out.sort(key=lambda x: -x["updated"])
    return out

def load_chat(cid):
    p = chat_path(cid)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None

def save_chat(chat):
    chat["updated"] = now_ts()
    save_json(chat_path(chat["id"]), chat)

def new_chat():
    import uuid
    cid = uuid.uuid4().hex[:12]
    chat = {"id": cid, "title": "New chat", "created": now_ts(),
            "updated": now_ts(), "model": "", "messages": []}
    save_chat(chat)
    return chat

def delete_chat(cid):
    p = chat_path(cid)
    if p.exists():
        p.unlink()
        return True
    return False

# ---------------------------------------------------------------- agent

BUILTIN_TOOLS = [
    {"type": "function", "function": {
        "name": "install_skill",
        "description": "Install a skill (or a pack of skills) from a git URL, e.g. a GitHub repository link that contains SKILL.md files. Use this whenever the user wants a skill installed and provides a link.",
        "parameters": {"type": "object", "properties": {
            "url": {"type": "string", "description": "Repository URL, e.g. https://github.com/user/repo"}},
            "required": ["url"]}}},
    {"type": "function", "function": {
        "name": "pull_model",
        "description": "Download a model from the Ollama library onto this machine, e.g. 'llama3.2', 'qwen3:4b', 'mistral-nemo'. Use when the user wants a model they don't have installed yet.",
        "parameters": {"type": "object", "properties": {
            "name": {"type": "string", "description": "Model name from the Ollama library"}},
            "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "list_models",
        "description": "List models installed on this machine.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "list_skills",
        "description": "List skills installed in Casium AI (name + one-line description).",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "read_skill",
        "description": "Read the full instructions of an installed skill by name. Call this before following a skill's instructions.",
        "parameters": {"type": "object", "properties": {
            "name": {"type": "string"}}, "required": ["name"]}}},
]

def builtin_tools_def():
    return BUILTIN_TOOLS

def run_builtin(name, args, events):
    """Execute a built-in app tool. Returns text result for the model."""
    args = args or {}
    if name == "list_models":
        models = OLLAMA.list_models()
        if not models:
            return "No models installed. Pull one with pull_model."
        return "\n".join(f"- {m['name']}  ({human_size(m['size'])})" for m in models)
    if name == "list_skills":
        skills = [s for s in list_skills() if s["enabled"]]
        if not skills:
            return "No skills installed."
        return "\n".join(f"- {s['name']}: {s['description'][:160]}" for s in skills)
    if name == "read_skill":
        sname = sanitize_name(args.get("name", ""))
        for s in list_skills():
            if s["dir"] == sname:
                d = SKILLS_DIR / sname
                for p in d.rglob("SKILL.md"):
                    return p.read_text(encoding="utf-8", errors="replace")[:12000]
        return f"Skill '{sname}' not found. Installed: {', '.join(s['dir'] for s in list_skills()) or 'none'}"
    if name == "pull_model":
        mname = args.get("name", "").strip()
        events.append({"type": "action", "name": "pull_model", "args": {"name": mname}})
        last = None
        try:
            for chunk in OLLAMA.pull_stream(mname):
                last = chunk
                st = chunk.get("status", "")
                if st in ("downloading", "verifying", "writing"):
                    events.append({"type": "action_step", "name": "pull_model",
                                   "step": st,
                                   "detail": f"{st} {human_size(chunk.get('completed', 0))} / {human_size(chunk.get('total', 0))}"})
        except (urllib.error.URLError, OSError) as e:
            return f"Pull failed: {e}"
        if last and last.get("status") == "success":
            return f"Model {mname} is installed."
        return f"Pull finished: {last.get('status', 'unknown') if last else 'no response'}"
    if name == "install_skill":
        url = args.get("url", "")
        events.append({"type": "action", "name": "install_skill", "args": {"url": url}})
        summary = []
        for ev in install_skill_from_url(url):
            events.append(ev)
            if ev.get("step") in ("done", "error", "skip"):
                summary.append(ev.get("detail", ""))
        return " | ".join(summary) or "install finished"
    return f"unknown tool {name}"

def build_system_prompt(use_mcp, use_skills, mcp_tool_count):
    parts = [
        "You are Casium AI, the assistant inside the Casium AI app. "
        "Everything runs locally on the user's machine - nothing goes to the cloud. "
        "Keep answers short and direct. Markdown is fine (lists, code blocks).",
        "",
        "## App tools",
        "- install_skill(url): install a skill pack from a git/GitHub URL. Always use it when the user asks to install a skill and gives a link.",
        "- pull_model(name): download a model from the Ollama library.",
        "- list_models / list_skills / read_skill: inspect this app's state.",
    ]
    if use_mcp:
        if mcp_tool_count:
            parts += [
                "",
                "## Connected apps (MCP)",
                "MCP servers are connected. Their tools appear as function calls - use them when the user asks for something they can do (repositories, issues, files, ...). "
                "Tool names look like <server>__<tool>. Pass the arguments exactly as the tool schema requires.",
            ]
        else:
            parts += ["", "## Connected apps (MCP)",
                      "The user enabled MCP but no server is running right now. If they ask for something an MCP app could do, tell them to start a server in the Explorer."]
    if use_skills:
        skills = [s for s in list_skills() if s["enabled"]]
        if skills:
            parts += ["", "## Skills", "Installed skills (call read_skill to open one before using it):"]
            for s in skills:
                desc = (s["description"] or "no description")[:200]
                parts.append(f"- {s['dir']}: {desc}")
    return "\n".join(parts)

def chat_agent(chat, model, user_text, use_mcp, use_skills):
    """Run one user turn through the model. Yields event dicts."""
    status = OLLAMA.status()
    if not status["online"]:
        yield {"type": "offline", "message": "Ollama is not running."}
        return
    models = {m["name"] for m in OLLAMA.list_models()}
    if model not in models:
        short = model.split(":")[0]
        match = [m for m in models if m.split(":")[0] == short]
        if match:
            model = match[0]
        else:
            yield {"type": "offline", "message": f"Model '{model}' is not installed. Pull it from the Models section."}
            return

    mcp_tools, mcp_map = ([], {})
    if use_mcp:
        mcp_tools, mcp_map = MCP.all_tools()

    messages = [{"role": "system", "content": build_system_prompt(use_mcp, use_skills, len(mcp_tools))}]
    for m in chat["messages"][-40:]:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})

    tools = builtin_tools_def() + mcp_tools
    used_tools = True
    retried_without_tools = False

    for _ in range(8):
        payload = {"model": model, "messages": messages, "stream": True, "keep_alive": "30m"}
        if tools and used_tools:
            payload["tools"] = tools
        got_tool_calls = False
        reply = ""
        try:
            for chunk in OLLAMA.chat_stream(payload):
                msg = chunk.get("message") or {}
                piece = msg.get("content") or ""
                if piece:
                    reply += piece
                    yield {"type": "token", "text": piece}
                tcs = msg.get("tool_calls") or []
                if tcs:
                    got_tool_calls = True
                    tool_calls = []
                    for tc in tcs:
                        fn = (tc.get("function") or {})
                        fname = fn.get("name", "")
                        fargs = fn.get("arguments") or {}
                        tool_calls.append((fname, fargs))
                        if fname in mcp_map:
                            yield {"type": "tool", "server": fname.split("__")[0],
                                   "tool": fname.split("__", 1)[1], "args": fargs}
                        else:
                            yield {"type": "action", "name": fname, "args": fargs}
                    messages.append({"role": "assistant", "content": reply,
                                     "tool_calls": [{"function": {"name": n, "arguments": a}} for n, a in tool_calls]})
                    reply = ""
                    for fname, fargs in tool_calls:
                        if fname in mcp_map:
                            try:
                                result = MCP.call(fname, fargs, mcp_map)
                                ok = True
                            except Exception as e:  # noqa: BLE001
                                result, ok = str(e)[:2000], False
                            yield {"type": "tool_done", "ok": ok, "preview": result[:300]}
                            messages.append({"role": "tool", "name": fname, "content": result})
                        else:
                            events = []
                            result = run_builtin(fname, fargs, events)
                            for ev in events:
                                yield ev
                            yield {"type": "action_done", "name": fname, "ok": not result.lower().startswith(("pull failed", "unknown tool"))}
                            messages.append({"role": "tool", "name": fname, "content": result})
                    continue
                if chunk.get("done"):
                    break
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            # model probably can't do function calling - retry once without tools
            if used_tools and not retried_without_tools and "tool" in body.lower():
                used_tools = False
                retried_without_tools = True
                continue
            yield {"type": "error", "message": body.strip()[:300] or f"Ollama error {e.code}"}
            return
        except (urllib.error.URLError, socket.timeout, OSError) as e:
            yield {"type": "error", "message": f"Lost connection to Ollama: {e}"}
            return

        if not got_tool_calls:
            if not reply.strip():
                yield {"type": "token", "text": "(empty response)"}
            return
        # got tool calls: loop continues
    yield {"type": "error", "message": "Stopped after 8 tool rounds."}

# ---------------------------------------------------------------- top-level chat

def process_chat(chat_id, model, user_text, use_mcp, use_skills):
    """Handle one user turn. Yields events. Persists the chat."""
    chat = load_chat(chat_id) if chat_id else None
    if chat is None:
        chat = new_chat()

    fast_url = detect_skill_install(user_text)

    # 1. deterministic skill install fast path
    if fast_url:
        chat["messages"].append({"role": "user", "content": user_text, "ts": now_ts()})
        if chat.get("title") in ("New chat", ""):
            chat["title"] = user_text.strip().splitlines()[0][:48]
        action_result = {"installed": []}
        for ev in install_skill_from_url(fast_url):
            yield ev
            if ev.get("step") == "done" and ev.get("installed"):
                action_result["installed"] = ev["installed"]
            if ev.get("step") == "error":
                action_result["error"] = ev.get("detail", "")

    # 2. the model
    status = OLLAMA.status()
    if fast_url and not status["online"]:
        if action_result.get("error"):
            note = f"I installed the skills, but something went wrong: {action_result['error']}"
        else:
            note = (f"Done - installed skills: {', '.join(action_result['installed'])}. "
                    "Ollama is offline, so I can't say more until it's running.")
        chat["messages"].append({"role": "assistant", "content": note, "ts": now_ts(),
                                 "actions": [{"name": "install_skill", "url": fast_url,
                                              "installed": action_result.get("installed", []),
                                              "error": action_result.get("error", "")}]})
        save_chat(chat)
        yield {"type": "token", "text": note}
        yield {"type": "done", "chat_id": chat["id"], "title": chat.get("title", "New chat")}
        return

    if fast_url:
        note = ("A skill install from " + fast_url + " was just executed by the app. "
                + ("Installed: " + ", ".join(action_result["installed"]) if action_result.get("installed")
                   else ("Problem: " + action_result.get("error", "unknown") if action_result.get("error") else "")))
    else:
        note = None

    if not status["online"]:
        msg = "Ollama is not running. Start it (then I can answer) - installed skills and MCP settings are saved."
        chat["messages"].append({"role": "user", "content": user_text, "ts": now_ts()})
        chat["messages"].append({"role": "assistant", "content": msg, "ts": now_ts()})
        save_chat(chat)
        yield {"type": "token", "text": msg}
        yield {"type": "done", "chat_id": chat["id"], "title": chat.get("title", "New chat")}
        return

    if not model:
        models = OLLAMA.list_models()
        model = get_settings().get("default_model") or (models[0]["name"] if models else "")
        if not model:
            msg = "There are no models installed yet. Pull one from the Models section first - then we can talk."
            chat["messages"].append({"role": "user", "content": user_text, "ts": now_ts()})
            chat["messages"].append({"role": "assistant", "content": msg, "ts": now_ts()})
            save_chat(chat)
            yield {"type": "token", "text": msg}
            yield {"type": "done", "chat_id": chat["id"], "title": chat.get("title", "New chat")}
            return

    chat["messages"].append({"role": "user", "content": user_text, "ts": now_ts()})
    if chat.get("title") in ("New chat", ""):
        chat["title"] = user_text.strip().splitlines()[0][:48]
    chat["model"] = model
    save_chat(chat)

    assistant = {"role": "assistant", "content": "", "ts": now_ts()}
    chat["messages"].append(assistant)

    model_text = user_text
    if note:
        model_text = user_text + "\n\n[app note: " + note + ". Acknowledge the result briefly and tell me what the skill(s) can do.]"

    for ev in chat_agent_turn(chat, model, model_text, assistant, use_mcp, use_skills):
        yield ev

    save_chat(chat)
    yield {"type": "done", "chat_id": chat["id"], "title": chat.get("title", "New chat"),
           "model": model}


def chat_agent_turn(chat, model, user_text, assistant_msg, use_mcp, use_skills):
    """Wrap chat_agent so tokens land in the stored assistant message."""
    for ev in chat_agent(chat, model, user_text, use_mcp, use_skills):
        if ev.get("type") == "token":
            assistant_msg["content"] += ev["text"]
        elif ev.get("type") == "action":
            assistant_msg.setdefault("actions", []).append(
                {"name": ev["name"], "args": ev.get("args", {})})
        elif ev.get("type") == "tool":
            assistant_msg.setdefault("tool_calls", []).append(
                {"server": ev["server"], "tool": ev["tool"], "args": ev.get("args", {}), "ok": None})
        elif ev.get("type") == "tool_done":
            calls = assistant_msg.get("tool_calls")
            if calls:
                calls[-1]["ok"] = ev.get("ok")
        elif ev.get("type") == "error":
            assistant_msg["content"] += f"\n\n[error: {ev.get('message')}]"
        yield ev

# ---------------------------------------------------------------- http

class Handler(BaseHTTPRequestHandler):
    server_version = "CasiumAI/" + APP_VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[casium] " + (fmt % args) + "\n")

    # -- helpers

    def _send(self, code, body, ctype="application/json", close=False):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if close:
            self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def _err(self, code, message):
        self._json({"error": message}, code)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except ValueError:
            return {}

    def _stream(self, generator):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            for ev in generator:
                self.wfile.write((json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        self.close_connection = True

    # -- routes

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            if path == "/api/status":
                st = OLLAMA.status()
                models = OLLAMA.list_models() if st["online"] else []
                skills = list_skills()
                self._json({
                    "version": APP_VERSION,
                    "data_dir": str(DATA_DIR),
                    "ollama": st,
                    "models": models,
                    "mcp": MCP.all(),
                    "skills": skills,
                    "chats": list_chats()[:30],
                    "settings": get_settings(),
                })
            elif path == "/api/models":
                self._json({"models": OLLAMA.list_models()})
            elif path == "/api/skills":
                self._json({"skills": list_skills()})
            elif path == "/api/mcp":
                self._json({"mcp": MCP.all()})
            elif path == "/api/chats":
                self._json({"chats": list_chats()[:30]})
            elif path.startswith("/api/chats/"):
                cid = path.rsplit("/", 1)[-1]
                chat = load_chat(cid)
                if chat:
                    self._json({"chat": chat})
                else:
                    self._err(404, "chat not found")
            elif path == "/api/health":
                self._json({"ok": True})
            elif path == "/" or path.startswith("/web") or Path(path).suffix in (
                    ".html", ".css", ".js", ".svg", ".png", ".ico", ".woff2"):
                self._static(path)
            else:
                self._err(404, "not found")
        except Exception as e:  # noqa: BLE001
            self._err(500, str(e)[:300])

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        body = self._body()
        try:
            if path == "/api/chat":
                chat_id = body.get("chat_id")
                model = body.get("model") or get_settings().get("default_model", "")
                text = (body.get("message") or "").strip()
                if not text:
                    self._err(400, "empty message")
                    return
                self._stream(process_chat(chat_id, model, text,
                                          bool(body.get("mcp", True)),
                                          bool(body.get("skills", True))))
            elif path == "/api/models/pull":
                name = (body.get("name") or "").strip()
                if not name:
                    self._err(400, "model name required")
                    return
                if OLLAMA.status()["online"] is False:
                    self._err(502, "Ollama is offline")
                    return
                self._stream(OLLAMA.pull_stream(name))
            elif path == "/api/models/delete":
                name = (body.get("name") or "").strip()
                code, res = OLLAMA.delete(name)
                if code == 200:
                    self._json({"ok": True})
                else:
                    self._err(code, res.get("error", "delete failed"))
            elif path == "/api/skills/install":
                url = (body.get("url") or "").strip()
                if not url:
                    self._err(400, "url required")
                    return
                self._stream(install_skill_from_url(url))
            elif path == "/api/skills/toggle":
                ok = toggle_skill(sanitize_name(body.get("name", "")), bool(body.get("enabled", True)))
                if not ok:
                    self._err(404, "skill not found")
                else:
                    self._json({"ok": True, "skills": list_skills()})
            elif path == "/api/skills/delete":
                ok = delete_skill(sanitize_name(body.get("name", "")))
                if not ok:
                    self._err(404, "skill not found")
                else:
                    self._json({"ok": True, "skills": list_skills()})
            elif path == "/api/mcp/add":
                try:
                    s = MCP.add(body)
                except ValueError as e:
                    self._err(400, str(e))
                    return
                self._json({"ok": True, "mcp": MCP.all()})
            elif path == "/api/mcp/start":
                s = MCP.get(sanitize_name(body.get("name", "")))
                if not s:
                    self._err(404, "server not found")
                    return
                threading.Thread(target=s.start, daemon=True).start()
                self._json({"ok": True})
            elif path == "/api/mcp/stop":
                s = MCP.get(sanitize_name(body.get("name", "")))
                if s:
                    s.stop()
                self._json({"ok": True, "mcp": MCP.all()})
            elif path == "/api/mcp/delete":
                ok = MCP.remove(sanitize_name(body.get("name", "")))
                if not ok:
                    self._err(404, "server not found")
                else:
                    self._json({"ok": True, "mcp": MCP.all()})
            elif path == "/api/chats/new":
                chat = new_chat()
                self._json({"chat": {"id": chat["id"], "title": chat["title"]}})
            elif path == "/api/chats/delete":
                ok = delete_chat(body.get("id", ""))
                self._json({"ok": ok})
            elif path == "/api/chats/rename":
                chat = load_chat(body.get("id", ""))
                title = (body.get("title") or "").strip()[:48]
                if chat and title:
                    chat["title"] = title
                    save_chat(chat)
                    self._json({"ok": True})
                else:
                    self._err(404, "chat not found")
            elif path == "/api/settings":
                s = get_settings()
                s.update(body)
                s["ollama_host"] = (s.get("ollama_host") or "http://127.0.0.1:11434").strip()
                save_settings(s)
                self._json({"ok": True, "settings": s})
            else:
                self._err(404, "not found")
        except Exception as e:  # noqa: BLE001
            try:
                self._err(500, str(e)[:300])
            except Exception:  # noqa: BLE001
                pass

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith("/api/chats/"):
            cid = path.rsplit("/", 1)[-1]
            self._json({"ok": delete_chat(cid)})
        else:
            self._err(404, "not found")

    def _static(self, path):
        if path == "/":
            fp = WEB_DIR / "index.html"
        else:
            rel = path.lstrip("/")
            if rel.startswith("web/"):
                rel = rel[4:]
            fp = (WEB_DIR / rel).resolve()
            if not str(fp).startswith(str(WEB_DIR.resolve())):
                self._err(403, "forbidden")
                return
        if not fp.is_file():
            self._err(404, "not found")
            return
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".woff2": "font/woff2",
        }.get(fp.suffix, "application/octet-stream")
        self._send(200, fp.read_bytes(), ctype)


def main():
    seed_bundled_skills()
    MCP.load()

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"  Casium AI v{APP_VERSION}")
    print(f"  UI:      http://localhost:{PORT}")
    print(f"  data:    {DATA_DIR}")
    print(f"  ollama:  {get_settings()['ollama_host']}")
    print()
    if not os.environ.get("CASIUM_NO_BROWSER"):
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        for s in MCP.servers.values():
            s.stop()
        print("\nbye.")


if __name__ == "__main__":
    main()
