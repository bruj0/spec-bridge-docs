# spec-bridge-v2

A deterministic validation harness for AI agent skill execution. Each SDD workflow step is an isolated **skill module** invoked by natural language, ie "I want to write the spec to add..". A single binary -- `spec-bridge-skill-tool` -- acts as a schema-validating, outcome-verifying harness that AI agents call at the end of each skill's instruction set.

---

## How It Works

The tool has exactly **two** responsibilities on every invocation:

1. **Schema validation (pre-condition)** -- validates YAML frontmatter of all artifacts produced or consumed by the skill against versioned Pydantic schemas.
2. **Outcome verification (post-condition)** -- checks that the skill achieved its declared goal: required artifacts exist, required fields are populated, and skill-specific completeness rules pass.

The tool is **not** an orchestrator. Skills encode all workflow logic as AI agent instructions. The agent calls this tool at the end to get a pass/fail verdict.

---

## Installation

### From the GitLab package registry (recommended)

=== "Local / CI with PAT"

    ```bash
    pip install \
      --index-url "https://__token__:<your-pat>@gitlab.com/api/v4/projects/80059368/packages/pypi/simple" \
      --extra-index-url "https://pypi.org/simple" \
      spec-bridge-skill-tool
    ```

    Replace `<your-pat>` with a GitLab personal access token that has `read_api` scope.

=== "GitLab CI (allowlisted pipeline)"

    ```bash
    pip install \
      --index-url "https://gitlab-ci-token:${CI_JOB_TOKEN}@gitlab.com/api/v4/projects/80059368/packages/pypi/simple" \
      --extra-index-url "https://pypi.org/simple" \
      spec-bridge-skill-tool
    ```

    The consuming project must be allowlisted under **spec-bridge-v2 → Settings → CI/CD → Token Access**.

### From source (development)

Requires Python 3.11+ and [`uv`](https://github.com/astral-sh/uv).

```bash
cd skill-tool
uv pip install -e .
```

To also install dev dependencies:

```bash
uv pip install -e ".[dev]"
```

Verify installation:

```bash
spec-bridge-skill-tool --help
```

### Initialize a project

Run once at the repo root to deploy skill instruction files and artifact templates into `.cursor/skills/`:

```bash
spec-bridge-skill-tool init
```

This writes `SKILL.md` and `template.md` for every skill into `.cursor/skills/spec-bridge-<skill>/`. These files are always regenerated from the source templates in `skill-tool/src/skill_tool/skills/<skill>/`.

---

## Configuration

Project settings live in `spec-bridge.conf` at the repo root. **Never parse this file directly** -- always use:

```bash
spec-bridge-skill-tool config
```

This returns a JSON object containing all resolved settings plus a fresh `session_id` UUID for the current agent turn:

| Field | Default | Description |
|-------|---------|-------------|
| `session_id` | (fresh UUID4) | Use for all subsequent skill calls this turn |
| `artifacts_dir` | `specs/` | Where feature artifacts are stored |
| `worktrees_dir` | `.worktrees/` | Per-WP git worktrees |
| `schema_version` | `v1` | Active schema version |
| `skill_templates_dir` | `.cursor/skills` | Deployed skill folders |
| `target_branch` | `main` | Default merge target |
| `vcs` | `git` | VCS type (`git` or `jj`) |
| `agents` | `["cursor"]` | Configured agent keys |

When `spec-bridge.conf` is absent, all defaults apply.

---

## Skills

Skills are Cursor slash commands that guide an AI agent through each step of the SDD workflow. They are deployed to `.cursor/skills/spec-bridge-<skill>/SKILL.md` after `init`.

The complete workflow, in order:

| Skill | Command | Purpose |
|-------|---------|---------|
| **specify** | `spec-bridge-specify` | Write a feature spec (`spec.md`) from a natural language description |
| **decompose** | `spec-bridge-decompose` | Decompose a spec into subsystems using misfit analysis (optional, for complex features) |
| **plan** | `spec-bridge-plan` | Create an implementation plan (`plan.md`) from a confirmed spec |
| **tasks** | `spec-bridge-tasks` | Generate work packages (`tasks.md` + `tasks/WPxx-*.md`) from a plan |
| **implement** | `spec-bridge-implement` | Create an isolated git worktree for a WP and implement it |
| **review** | `spec-bridge-review` | Review a completed WP and apply a lane transition |
| **accept** | `spec-bridge-accept` | Validate all WPs are done and the feature is ready to merge |
| **merge** | `spec-bridge-merge` | Merge all WP branches into the target branch and remove worktrees |

### Using a skill

Each skill follows this pattern:

1. Open Cursor and trigger the slash command (e.g., `@spec-bridge-specify`).
2. The skill's `SKILL.md` tells the AI agent what to create on disk.
3. The agent runs `spec-bridge-skill-tool config` to load project settings and obtain a `session_id`.
4. The agent creates or modifies artifacts as instructed.
5. The agent calls `spec-bridge-skill-tool <skill> --feature <slug> --session-id $SESSION_ID` as the final step.
6. The tool exits `0` (pass) or non-zero (fail) with structured stdout output.

### Example: specify a new feature

```bash
# In Cursor, run @spec-bridge-specify and describe your feature.
# The agent will conduct a discovery interview, then call:
spec-bridge-skill-tool specify --feature my-feature-slug --session-id $SESSION_ID
```

### Example: implement a work package

```bash
# After tasks are generated and a WP is in lane: planned, run @spec-bridge-implement.
# The agent creates a worktree and implements the WP, then calls:
spec-bridge-skill-tool implement --feature my-feature-slug --wp-id WP01 --session-id $SESSION_ID
```

---

## Artifact Layout

```
specs/
  <feature-slug>/
    spec.md          # feature specification
    plan.md          # implementation plan
    tasks.md         # work package index
    tasks/
      WP01-<name>.md # work package prompt files
      WP02-<name>.md
.worktrees/
  <feature-slug>-WP01/  # isolated git worktree per WP (created by implement)
.cursor/skills/
  spec-bridge-specify/
    SKILL.md         # skill instruction file (regenerated by init)
    template.md      # artifact template (regenerated by init)
  spec-bridge-plan/
    ...
```

---

## Development

All Python execution uses `uv run`:

```bash
cd skill-tool
uv run pytest tests/ -v
uv run mypy --strict src/
uv run ruff check src/ tests/
```

### Package layout

```
skill-tool/
  pyproject.toml
  src/skill_tool/
    cli.py                        # typer app; one subcommand per skill + config
    core/                         # shared infrastructure only
    adapters/                     # agent-specific file generation (cursor, etc.)
    init_cmd/                     # project initialization + bundled schemas
    skills/
      specify/                    # skill.py + template.md (co-located)
      plan/
      decompose/
      tasks/
      implement/
      review/
      accept/
      merge/
  tests/                          # integration tests
```

See `docs/adr/` for Architecture Decision Records and `specs/043-*/` for the foundational feature spec driving this architecture.
