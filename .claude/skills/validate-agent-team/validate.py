#!/usr/bin/env python3
"""Validate the ManufacturingOpsTeam Claude Code agent team configuration.

Usage (from repo root): python3 .claude/skills/validate-agent-team/validate.py
Exit code 0 when there are no errors; warnings do not fail the run.
"""
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    print("ERROR: PyYAML is required (pip install pyyaml)")
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[3]
AGENTS_DIR = ROOT / ".claude" / "agents"
SKILLS_DIR = ROOT / ".claude" / "skills"
KNOWLEDGE_DIR = ROOT / "knowledge"
ROSTER_DOCS = [ROOT / "docs" / "software-team.md", ROOT / "CLAUDE.md"]
ORCHESTRATOR = "orchestrator"

# Documented subagent frontmatter fields (code.claude.com/docs/en/sub-agents, reviewed 2026-11-25)
AGENT_FIELDS = {
    "name", "description", "tools", "disallowedTools", "model", "permissionMode",
    "maxTurns", "autoCompactWindow", "skills", "mcpServers", "hooks", "memory",
    "background", "omitClaudeMd", "effort", "isolation", "color", "initialPrompt",
    "experimental",
}
# Documented skill frontmatter fields (code.claude.com/docs/en/skills, reviewed 2026-11-25)
SKILL_FIELDS = {
    "name", "description", "when_to_use", "argument-hint", "arguments",
    "disable-model-invocation", "user-invocable", "allowed-tools", "disallowed-tools",
    "model", "effort", "context", "agent", "background", "hooks", "paths", "shell",
    "metadata", "license", "compatibility",
}
MODEL_ALIASES = {"sonnet", "opus", "haiku", "fable", "inherit"}
COLORS = {"red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"}
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def frontmatter(path):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        err(f"{path.relative_to(ROOT)}: frontmatter must start with '---' on line 1")
        return None, text
    try:
        end = lines[1:].index("---") + 1
    except ValueError:
        err(f"{path.relative_to(ROOT)}: no closing '---' for frontmatter")
        return None, text
    try:
        data = yaml.safe_load("\n".join(lines[1:end])) or {}
    except yaml.YAMLError as exc:
        err(f"{path.relative_to(ROOT)}: YAML does not parse: {exc}")
        return None, text
    if not isinstance(data, dict):
        err(f"{path.relative_to(ROOT)}: frontmatter is not a mapping")
        return None, text
    return data, "\n".join(lines[end + 1:])


def as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value]
    # comma-separated string, but keep Agent(a, b) together
    parts, depth, cur = [], 0, ""
    for ch in str(value):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


# ---- skills ----
skills = {}
for skill_md in sorted(SKILLS_DIR.glob("*/SKILL.md")):
    folder = skill_md.parent.name
    data, body = frontmatter(skill_md)
    if data is None:
        continue
    skills[folder] = data
    rel = skill_md.relative_to(ROOT)
    unknown = set(data) - SKILL_FIELDS
    if unknown:
        err(f"{rel}: unknown skill frontmatter field(s): {sorted(unknown)}")
    if not NAME_RE.match(folder):
        err(f"{rel}: skill folder name must be lowercase-hyphen")
    if data.get("name") and data["name"] != folder:
        err(f"{rel}: name '{data['name']}' does not match folder '{folder}'")
    desc = str(data.get("description", "")).strip()
    if len(desc) < 30:
        err(f"{rel}: description missing or too short")
    if len(desc) + len(str(data.get("when_to_use", ""))) > 1536:
        warn(f"{rel}: description + when_to_use exceeds 1,536 chars (will be truncated)")
    n_lines = len(skill_md.read_text(encoding="utf-8").splitlines())
    if n_lines > 500:
        warn(f"{rel}: {n_lines} lines; docs recommend < 500")

# ---- agents ----
agents = {}
used_skills = set()
for agent_md in sorted(AGENTS_DIR.glob("*.md")):
    rel = agent_md.relative_to(ROOT)
    data, body = frontmatter(agent_md)
    if data is None:
        continue
    name = data.get("name")
    if not name:
        err(f"{rel}: missing 'name' (Claude Code would treat it as documentation)")
        continue
    if not NAME_RE.match(str(name)) or ":" in str(name) or len(str(name)) > 256:
        err(f"{rel}: invalid name '{name}'")
    if name in agents:
        err(f"{rel}: duplicate agent name '{name}'")
    agents[name] = data
    unknown = set(data) - AGENT_FIELDS
    if unknown:
        err(f"{rel}: unknown subagent frontmatter field(s) (silently ignored by Claude Code): {sorted(unknown)}")
    if len(str(data.get("description", "")).strip()) < 30:
        err(f"{rel}: description missing or too short")
    model = data.get("model")
    if model is None:
        warn(f"{rel}: no model set (will follow subagent model order)")
    elif not (model in MODEL_ALIASES or str(model).startswith("claude-")):
        err(f"{rel}: unsupported model '{model}'")
    color = data.get("color")
    if color is not None and color not in COLORS:
        err(f"{rel}: unsupported color '{color}'")
    tools = as_list(data.get("tools"))
    if "Skill" in tools and data.get("skills"):
        warn(f"{rel}: lists 'Skill' in tools; use the skills field for preloading")
    for skill in as_list(data.get("skills")):
        used_skills.add(skill)
        if skill not in skills:
            err(f"{rel}: skill '{skill}' not found at .claude/skills/{skill}/SKILL.md")
        elif str(skills[skill].get("disable-model-invocation", "")).lower() in {"true", "yes", "on", "1"}:
            err(f"{rel}: skill '{skill}' sets disable-model-invocation and cannot be preloaded")
    if len(body.strip()) < 400:
        warn(f"{rel}: system prompt body looks short")
    knowledge = KNOWLEDGE_DIR / str(name) / "README.md"
    if not knowledge.exists():
        err(f"{rel}: missing {knowledge.relative_to(ROOT)}")
    if "docs/project-scope.md" not in body:
        err(f"{rel}: system prompt does not reference docs/project-scope.md")

# ---- roster docs ----
for doc in ROSTER_DOCS:
    if not doc.exists():
        err(f"missing {doc.relative_to(ROOT)}")
        continue
    text = doc.read_text(encoding="utf-8")
    for name in agents:
        if f"`{name}`" not in text and name not in text:
            err(f"{doc.relative_to(ROOT)}: agent '{name}' not documented")

# ---- orchestrator delegation list ----
if ORCHESTRATOR not in agents:
    err("no orchestrator agent defined")
else:
    tools = as_list(agents[ORCHESTRATOR].get("tools"))
    agent_tool = next((t for t in tools if t.startswith("Agent")), None)
    if not agent_tool:
        err("orchestrator cannot delegate: 'Agent' missing from tools")
    else:
        m = re.match(r"Agent\((.*)\)", agent_tool)
        allowed = {a.strip() for a in m.group(1).split(",")} if m else set()
        for a in sorted(allowed - set(agents)):
            err(f"orchestrator Agent(...) lists unknown agent '{a}'")
        for a in sorted(set(agents) - allowed - {ORCHESTRATOR}):
            err(f"orchestrator Agent(...) does not include '{a}'")

for s in sorted(set(skills) - used_skills):
    warn(f"skill '{s}' is not preloaded by any agent (still invocable via the Skill tool)")

# ---- report ----
print(f"Agents: {len(agents)}  Skills: {len(skills)}")
models = {}
for n, d in agents.items():
    models.setdefault(str(d.get("model")), []).append(n)
for m, names in sorted(models.items()):
    print(f"  model {m}: {', '.join(sorted(names))}")
for w in warnings:
    print(f"WARNING: {w}")
for e in errors:
    print(f"ERROR: {e}")
print("RESULT:", "PASS" if not errors else f"FAIL ({len(errors)} error(s))",
      f"with {len(warnings)} warning(s)")
sys.exit(1 if errors else 0)
