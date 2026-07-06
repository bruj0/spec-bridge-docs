# Project Overview

## What is spec-bridge-v2?

**spec-bridge-v2** is a deterministic validation harness for AI agent skill execution within
Spec-Driven Development (SDD) workflows. It provides a single binary — `spec-bridge-skill-tool`
— that AI agents invoke at the end of each workflow step to receive a machine-readable pass/fail
verdict on the artifacts they produced.

This is a ground-up rewrite of spec-bridge v1 with a fundamentally different architecture:
instead of a monolithic developer-facing CLI, each SDD workflow step is an isolated **skill
module**, and the binary acts as a schema-validating, outcome-verifying harness.

---

## Core Purpose

| Goal | Description |
|------|-------------|
| **Determinism** | Every invocation of the same skill against the same artifacts produces the same verdict — no side effects, no randomness |
| **Isolation** | Each skill module (`specify`, `plan`, `tasks`, `implement`, `review`, `accept`, `merge`) is fully self-contained and can be developed, tested, or replaced independently |
| **Schema-first** | Artifact shape is governed by versioned YAML schema files; Pydantic models are derived at runtime — no hardcoded field names in Python |
| **Agent-native output** | All output is structured JSON on stdout, exit 0 = pass, exit 1 = fail — compatible with any AI agent execution environment |

---

## Technology Stack

- **Language**: Python 3.11+
- **CLI framework**: Typer (>=0.12)
- **Data validation**: Pydantic v2 (>=2.0)
- **YAML parsing**: ruamel.yaml (>=0.18) for frontmatter, PyYAML (>=6.0) for schema files
- **Output**: Rich (>=13.0) for formatted terminal output
- **Build tool**: Hatchling (via pyproject.toml)
- **Test runner**: pytest (>=9.0.2)
- **Type checker**: mypy (strict mode)
- **Linter**: ruff

---

## Key Features

- **Two-responsibility contract** (constitutionally enforced): schema validation as pre-condition,
  outcome verification as post-condition — nothing else
- **12 sub-commands**: `init`, `specify`, `decompose`, `plan`, `tasks`, `implement`, `review`,
  `accept`, `merge`, `audit`, `audit-fix`, `execute` — one per SyDD/SDD workflow step plus
  workflow utility sub-commands
- **Synthesis-Driven Development (SyDD)**: the `decompose` skill extends the SDD lifecycle with
  misfit analysis and subsystem decomposition, derived from Christopher Alexander's design methodology
- **spec.md status lifecycle**: `spec.md` frontmatter tracks the feature's progress through
  `draft` -> `planned` -> `planned_tasks` -> `planned_accepted` -> `implemented`; each skill
  validates the spec status as a pre-condition before running its own checks
- **JSON-first skill summaries**: `implement` and `review` skills require agents to fill a
  structured JSON template (`summary-template.json` / `review-template.json`) rather than prose;
  the tool validates the JSON, renders the Markdown summary, and persists both formats side-by-side
- **Versioned review summaries**: each code review is stored as `WP<id>-review-summary-v<N>.json`
  and `WP<id>-review-summary-v<N>.md`; the review cycle tracks status (`requested`,
  `implemented`, `approved`) across multiple rounds; the `implement` skill marks a review
  `implemented` when requested changes are addressed
- **Structured review issues**: the review JSON template supports a typed `issues[]` list, each
  entry carrying `severity`, `title`, `description`, `fix`, `misfits[]`, `subtasks[]`, and
  `affected_files[]` -- replacing free-form notes with machine-readable change requests; a top-level
  `dependency_notes` field captures inter-WP dependency impacts
- **Audit on-ramp**: the `audit` and `audit-fix` skills provide a structured path from an
  existing codebase into the SDD workflow. `audit` produces `questions.md` (a validated catalogue
  of architectural questions); `audit-fix` runs an interactive resolution session, answers every
  question, and generates a `plan.md` that feeds the standard `tasks` -> `implement` pipeline
- **Workflow utility sub-commands**: `generate-implement-summary-template`,
  `append-implement-summary`, `generate-review-template`, `append-review-summary`,
  `set-spec-status`, `check-dep-wps-ready` -- each codified in `core/workflow.py`
- **WP dependency gate**: `check-dep-wps-ready` blocks a WP's implement step when any declared
  dependency WP has not yet reached `lane: done`
- **Versioned artifact schemas**: YAML schema files under `specs/.schemas/v1/` define the
  frontmatter contract for each artifact type (`spec.yaml`, `plan.yaml`, `tasks.yaml`, `wp.yaml`,
  `decomposition.yaml`, `questions.yaml`)
- **Adapter pattern**: agent-specific file generation (currently Cursor) is isolated behind an
  adapter interface; adding a new agent requires one new file
- **Session-scoped audit logging**: every invocation appends to debug and audit log files keyed
  by `--session-id`, enabling full traceability across a multi-step agent session
- **Idempotent `init`**: schema files are placed once; skill instruction files are always
  regenerated to stay in sync with current templates
- **Strict `--session-id` gate**: the dispatch pipeline refuses to run any skill without a
  session UUID, enforcing traceability from the first step

---

## Project Structure

```
spec-bridge-v2/
+-- skill-tool/                         # spec-bridge-skill-tool package
|   +-- pyproject.toml                  # Package metadata, dependencies
|   +-- src/skill_tool/
|   |   +-- cli.py                      # Typer app: 12 sub-commands
|   |   +-- core/                       # Shared infrastructure
|   |   |   +-- config.py              # spec-bridge.conf loader
|   |   |   +-- contracts.py           # CheckResult, InvocationResult, Protocols
|   |   |   +-- dispatch.py            # 10-step pipeline for all skill sub-commands
|   |   |   +-- frontmatter.py         # ruamel.yaml frontmatter read/write
|   |   |   +-- logging.py             # Session-scoped debug and audit logging
|   |   |   +-- output.py              # JSON stdout emitter (CliOutput)
|   |   |   +-- schema.py              # SchemaLoader: YAML -> Pydantic model
|   |   |   +-- workflow.py            # SDD workflow utilities (spec status, summaries, review)
|   |   +-- adapters/                  # Agent-specific file generation
|   |   |   +-- base.py               # SKILL_NAMES registry (11 skills)
|   |   |   +-- cursor.py             # CursorAdapter (SKILL.md generator)
|   |   |   +-- templates/            # Per-skill .md templates (one per skill)
|   |   +-- init_cmd/                  # Project initialisation
|   |   |   +-- init.py               # run_init(): 3-step bootstrap
|   |   |   +-- schemas/v1/           # Bundled schema YAML files
|   |   +-- skills/                    # One isolated module per skill
|   |       +-- specify/skill.py
|   |       +-- decompose/skill.py
|   |       +-- plan/skill.py
|   |       +-- tasks/skill.py
|   |       +-- implement/skill.py
|   |       +-- implement/summary-template.json # JSON template for implement summaries
|   |       +-- review/skill.py
|   |       +-- review/review-template.json     # JSON template for review summaries
|   |       +-- accept/skill.py
|   |       +-- merge/skill.py
|   |       +-- audit/skill.py              # Codebase audit on-ramp: validates questions.md
|   |       +-- audit_fix/skill.py          # Resolution session: answered_count == question_count
|   |       +-- execute/                    # Automated WP loop: checkpoint + report contracts
|   +-- tests/                         # Integration + unit tests
+-- docs/
|   +-- adr/                           # Architecture Decision Records
|   +-- c4/                            # C4 model documentation (this directory)
+-- specs/                             # Feature specifications (dogfooding SDD)
|   +-- 042-spec-bridge-commands-as-cursor-skills/
|   +-- 043-modular-skill-aligned-cli-refactor/
||   +-- 044-audit-and-audit-fix-workflows/
+-- AGENTS.md                          # Agent entry point and development rules
```

---

## Getting Started

```bash
# Install the tool from the GitLab package registry
pip install \
  --index-url "https://__token__:<your-pat>@gitlab.com/api/v4/projects/80059368/packages/pypi/simple" \
  --extra-index-url "https://pypi.org/simple" \
  spec-bridge-skill-tool

# Or install from source for development
cd skill-tool && pip install -e ".[dev]"

# Initialise a project (places schemas + generates Cursor skill files)
spec-bridge-skill-tool init --agent cursor --project-root /path/to/project

# Run a skill validation (invoked by AI agent at end of each skill workflow step)
spec-bridge-skill-tool specify \
  --feature 043-my-feature \
  --session-id "$(python -c 'import uuid; print(uuid.uuid4())')"

# Run the decompose skill validation (SyDD -- after specify, before plan)
spec-bridge-skill-tool decompose \
  --feature 043-my-feature \
  --session-id "$(python -c 'import uuid; print(uuid.uuid4())')"

# Run tests
uv run pytest tests/ -v

# Type-check
uv run mypy --strict src/
```

---

## Architecture Summary

The tool follows a strict separation of three concerns:

1. **CLI layer** (`cli.py`): accepts arguments, routes to the dispatch pipeline
2. **Core layer** (`core/`): shared, skill-agnostic infrastructure — config loading, schema
   loading, frontmatter parsing, dispatch pipeline, output formatting, session logging
3. **Skill layer** (`skills/`): isolated per-skill modules that implement `SkillContract` —
   the only place where skill-specific artifact knowledge lives

The SyDD (`decompose`) skill extends the standard SDD flow by inserting a structured misfit
analysis and subsystem decomposition step between `specify` and `plan`. The resulting
`decomposition.md` artifact informs how work packages are partitioned and how inter-subsystem
contracts are defined.

The adapter layer (`adapters/`) sits outside this pipeline and is only called by `init` to
generate agent-specific instruction files. It never participates in validation.

See [Architecture Overview](./2-architecture-overview.md) for C4 diagrams and
[Workflow Overview](./3-workflow-overview.md) for the full SDD lifecycle and dispatch pipeline.
