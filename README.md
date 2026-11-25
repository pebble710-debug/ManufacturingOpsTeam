# ManufacturingOpsTeam
A manufacturing operations dashboard built by an AI software development team to track shipments, inventory, packaging errors, and operational performance.

## Project documentation

Pre-build research and the version 1 scope are in [`docs/`](docs/README.md):

- [docs/README.md](docs/README.md) – research index and tagging convention (researched / assumption / proposed)
- [docs/project-scope.md](docs/project-scope.md) – version 1 scope, fictional sample data plan, version 2 backlog

> Educational prototype. All companies, customers, part numbers and records are fictional.

## AI software team

The app is built by 12 Claude Code subagents (`.claude/agents/`) that share 19 project skills
(`.claude/skills/`). See [CLAUDE.md](CLAUDE.md) for how to ask the orchestrator to build
software, and [docs/software-team.md](docs/software-team.md) for the full roster, model
assignments and responsibilities. Validate the team with:

```bash
python3 .claude/skills/validate-agent-team/validate.py
```
