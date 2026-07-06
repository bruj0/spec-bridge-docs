# Workflow Overview

## Core Workflows

### Workflow 1: SyDD Lifecycle (Full Feature from Spec to Merge)

The Synthesis-Driven Development lifecycle moves a feature through eight stages. Each stage is
executed by an AI agent following a SKILL.md instruction set, ending with a call to
`spec-bridge-skill-tool` for a deterministic verdict.

The `decompose` skill is unique to the SyDD lifecycle. It sits between `specify` and `plan`
and validates `decomposition.md` -- a structured document that derives subsystem boundaries,
abstract components, and inter-subsystem contracts from identified misfits.

```mermaid
flowchart TB
  SPECIFY["specify<br/>spec.md created<br/>and schema-valid"]
  DECOMPOSE["decompose<br/>decomposition.md<br/>misfits and subsystems"]
  PLAN["plan<br/>plan.md created<br/>subsystem column required"]
  TASKS["tasks<br/>tasks.md + WP*.md<br/>files created"]
  IMPLEMENT["implement WPxx<br/>WP in 'doing' lane<br/>worktree created"]
  REVIEW["review WPxx<br/>WP in 'for_review'<br/>lane"]
  ACCEPT["accept WPxx<br/>WP in 'done'<br/>all artifacts present"]
  MERGE["merge<br/>all WPs done<br/>worktrees absent"]

  SPECIFY -->|"decompose skill"| DECOMPOSE
  DECOMPOSE -->|"plan skill"| PLAN
  PLAN -->|"tasks skill"| TASKS
  TASKS -->|"implement skill"| IMPLEMENT
  IMPLEMENT -->|"review skill"| REVIEW
  REVIEW -->|"accept skill"| ACCEPT
  ACCEPT -->|"back to implement<br/>if more WPs"| IMPLEMENT
  ACCEPT -->|"all WPs accepted"| MERGE
```

**At each stage**, the AI agent:
1. Reads the matching `SKILL.md` instruction file from `.cursor/skills/spec-bridge-<skill>/`
2. Creates or modifies artifacts on disk according to the instructions
3. Calls `spec-bridge-skill-tool <skill> --feature <slug> --session-id <uuid>`
4. Receives a JSON verdict (exit 0 = pass, exit 1 = fail)
5. If failed: reads the `errors` array and corrects artifacts, then re-invokes

**SyDD validation rules** enforced across the lifecycle:

| Rule ID | Skill | Check | Enforcement |
|---------|-------|-------|-------------|
| SyDD-S01 | `specify` | `body_context_non_empty` -- Context section is non-trivial | Advisory |
| SyDD-S02 | `specify` | `body_misfits_non_empty` -- Misfits section is non-trivial | Advisory |
| SyDD-S03 | `specify` | `body_use_cases_present` -- Use Cases section is non-trivial | Advisory |
| SyDD-D01 | `decompose` | `decomposition-exists` -- `decomposition.md` is present | Blocking |
| SyDD-D02 | `decompose` | `decomposition-frontmatter-valid` -- schema-valid frontmatter | Blocking |
| SyDD-D03 | `decompose` | `decomposition-misfits-non-empty` -- Misfits section filled | Blocking |
| SyDD-D04 | `decompose` | `decomposition-subsystems-non-empty` -- Subsystems section filled | Blocking |
| SyDD-D05 | `decompose` | `decomposition-contracts-non-empty` -- Contracts section filled | Blocking |
| SyDD-P01 | `plan` | `plan-has-decomposition-ref` -- plan references decomposition | Advisory |
| SyDD-P02 | `plan` | `plan-has-abstract-components` -- Abstract Components section filled | Advisory |
| SyDD-P03 | `plan` | `plan-has-contracts-if-multiple` -- Contracts section filled (multi-subsystem) | Advisory |
| SyDD-P04 | `plan` | `plan-has-subsystem-column` -- Work Packages table has Subsystem column | Advisory |
| SyDD-T01 | `tasks` | `wp-has-subsystem-field` -- each WP frontmatter has `subsystem:` field | Advisory |
| SyDD-T02 | `tasks` | `misfit-coverage-section` -- tasks.md has Misfit Coverage section | Advisory |

---

---

### Workflow 2: Audit On-Ramp (Existing Codebase to Plan)

The audit workflow provides a structured on-ramp for existing codebases that do not start from a
blank spec. It produces a `questions.md` question catalogue, resolves each question in an
interactive session, and generates a `plan.md` that feeds directly into the standard `tasks` step.

```mermaid
flowchart TB
  AUDIT["audit<br/>questions.md created<br/>audit_mode + question_count<br/>frontmatter valid"]
  AUDITFIX["audit-fix<br/>all questions answered<br/>answered_count == question_count"]
  PLAN_VAL["plan validator<br/>plan.md schema-valid<br/>called by audit-fix as<br/>dual-call validation"]
  TASKS["tasks<br/>tasks.md + WP*.md<br/>files created"]
  IMPLEMENT["implement WPxx<br/>WP in 'doing' lane<br/>worktree created"]

  AUDIT -->|"audit-fix skill"| AUDITFIX
  AUDITFIX -->|"dual-calls plan validator"| PLAN_VAL
  PLAN_VAL -->|"tasks skill"| TASKS
  TASKS -->|"implement skill"| IMPLEMENT
```

**Phase 1 -- audit**: the AI agent performs a structured codebase review (12 review dimensions)
and writes findings as structured questions in `questions.md`. Each question carries:
- `Where`: specific code location
- `Why this matters`: risk or impact
- `Question`: exact question asked of the codebase owner
- `Recommendation`: suggested resolution
- `Answer:` (blank -- filled during audit-fix)

Two audit modes are supported:
- `review` -- agent generates questions from scratch via the 12-dimension review
- `import` -- agent normalises an existing review document into the canonical format

**Phase 2 -- audit-fix**: the AI agent presents questions one at a time to the developer.
Valid verdicts are: `intended behavior`, `bug`, `approved improvement`, `deferred`, `out-of-scope`.
The agent:
1. Presents one question per turn, ending each with `WAITING_FOR_VERDICT`
2. Handles research detours inline (Exa, Context7, code-vectorizer) while waiting for the verdict
3. Writes the verdict into the `Answer:` field and increments `answered_count` after each question
4. Filters by verdict (`bug` / `approved improvement` -> WP candidates; `deferred` -> Open Questions)
5. Generates `plan.md` from the plan template with traceability link to `questions.md`
6. Calls `spec-bridge-skill-tool audit-fix` (completion check) then `spec-bridge-skill-tool plan`
   (schema check) -- dual-call validation

**Dual-call validation sequence**:

```mermaid
sequenceDiagram
  participant AGENT as AI Agent
  participant CLI1 as spec-bridge-skill-tool audit-fix
  participant CLI2 as spec-bridge-skill-tool plan

  AGENT->>CLI1: --feature F --session-id S
  CLI1-->>AGENT: ok (answered_count == question_count)
  AGENT->>CLI2: --feature F --session-id S
  CLI2-->>AGENT: ok (plan.md schema-valid)
```

---

### Workflow 3: Automated WP Execution (`execute`)

The `execute` skill runs all planned work packages sequentially without manual intervention.
It drives the `implement → review` loop for each WP and produces a checkpoint file (for crash
recovery) plus a final execution report.

```mermaid
flowchart TB
  TASKS_READY["All WPs in lane: planned<br/>tasks.md present"]
  CHECKPOINT["execution-checkpoint.json<br/>per-WP status + resume state"]
  IMPL["implement WPxx<br/>worktree created<br/>implement summary filled"]
  REVIEW["review WPxx<br/>review summary filled<br/>verdict: approved or changes-requested"]
  CHANGES{"verdict?"}
  DONE_WP["WP lane: done<br/>checkpoint updated"]
  NEXT{"more WPs?"}
  REPORT["execution-report.json<br/>execution-report.md<br/>succeeded + failed counts"]

  TASKS_READY -->|"execute skill reads"| CHECKPOINT
  CHECKPOINT -->|"for each pending WP"| IMPL
  IMPL --> REVIEW
  REVIEW --> CHANGES
  CHANGES -->|"approved"| DONE_WP
  CHANGES -->|"changes-requested"| IMPL
  DONE_WP --> NEXT
  NEXT -->|"yes"| IMPL
  NEXT -->|"no"| REPORT
```

**Artifacts produced**:

| Artifact | Location | Purpose |
|----------|----------|---------|
| `execution-checkpoint.json` | `specs/<feature>/` | Crash-recovery state: per-WP `status`, timestamps, review verdict |
| `execution-report.json` | `specs/<feature>/` | Final structured report: `ExecutionReport` model with per-WP results, warnings, uncaught errors |
| `execution-report.md` | `specs/<feature>/` | Human-readable rendering of the execution report |
| `logs/execution.log` | `specs/<feature>/` | Main orchestration log |
| `logs/WPxx.log` | `specs/<feature>/` | Per-WP log for each processed work package |

**WP status states** (tracked in checkpoint):

| Status | Meaning |
|--------|---------|
| `pending` | Not yet started |
| `implementing` | implement skill in progress |
| `impl_done` | implement skill passed, awaiting review |
| `reviewing` | review skill in progress |
| `done` | review approved, WP complete |
| `failed` | implement or review skill exited non-zero |

**Resume behaviour**: if interrupted, re-running `execute` reads the checkpoint and skips WPs
already in `done` or `failed`, resuming from the first `pending` or in-progress WP.

> **Implementation status**: `execute` contracts and data models (`contracts.py`, `helpers.py`,
> `state_validator.py`, `checkpoint.py`, `report_generator.py`) are complete from WP01.
> The orchestration loop (full workflow automation) is being implemented in WP02.

---

### Workflow 4: Project Initialisation (`init`)

The `init` command is the only command that modifies disk state beyond logging. It is
safe to re-run (idempotent for schemas; always regenerates skill files).

```mermaid
sequenceDiagram
  participant DEV as Developer
  participant CLI as cli.py
  participant INIT as init_cmd/init.py
  participant FS as Filesystem

  DEV->>CLI: spec-bridge-skill-tool init --agent cursor
  CLI->>INIT: run_init(project_root, agents=["cursor"])
  INIT->>FS: write spec-bridge.conf (if absent)
  INIT->>FS: copy schemas/v1/*.yaml to specs/.schemas/v1/ (if absent)
  INIT->>INIT: CursorAdapter().generate_skill_files(project_root, SKILL_NAMES)
  INIT->>FS: write .cursor/skills/spec-bridge-<skill>/SKILL.md (always overwrite)
  CLI-->>DEV: JSON result (schemas_written, agent_files_written, ...)
```

**Steps in `run_init()`**:
1. Write `spec-bridge.conf` if absent (config-once: respects user modifications)
2. Copy bundled schema YAML files to `specs/.schemas/v1/` (idempotent: skipped if exists)
3. Generate agent skill instruction files (regenerative: always overwrites to stay in sync)

---

### Workflow 5: Skill Dispatch Pipeline (10 Steps)

Every skill sub-command (except `init`) flows through the same `run_skill()` dispatch
pipeline in `core/dispatch.py`. This ensures consistent validation, output, and logging
regardless of which skill is invoked.

```mermaid
sequenceDiagram
  participant AGENT as AI Agent
  participant CLI as cli.py
  participant DISPATCH as dispatch.run_skill()
  participant CONFIG as core/config.py
  participant SCHEMA as core/schema.py
  participant FM as core/frontmatter.py
  participant LOGGER as core/logging.py
  participant SKILL as skills/<skill>/skill.py
  participant OUTPUT as core/output.py

  AGENT->>CLI: spec-bridge-skill-tool <skill> --feature F --session-id S
  CLI->>DISPATCH: run_skill(skill_name, skill_impl, feature, session_id, project_root)

  Note over DISPATCH: Step 1 - session-id gate (FR-024)
  alt session_id is empty
    DISPATCH->>OUTPUT: CliOutput.error(session_id_required)
    OUTPUT-->>AGENT: JSON error, exit 1
  end

  Note over DISPATCH: Step 2 - load config
  DISPATCH->>CONFIG: load_project_config(project_root)
  CONFIG-->>DISPATCH: ProjectConfig

  Note over DISPATCH: Step 3 - resolve paths
  Note over DISPATCH: feature_dir = project_root / artifacts_dir / feature

  Note over DISPATCH: Step 4 - verify schema version directory
  alt schema dir missing
    DISPATCH->>OUTPUT: CliOutput.error(schema_dir_missing)
    OUTPUT-->>AGENT: JSON error, exit 1
  end

  Note over DISPATCH: Step 5 - consumption-time frontmatter validation (FR-005)
  DISPATCH->>FM: read_frontmatter_only(artifact) for each expected_artifact
  alt frontmatter unreadable
    DISPATCH->>OUTPUT: CliOutput.error(frontmatter_failed)
    OUTPUT-->>AGENT: JSON error, exit 1
  end

  Note over DISPATCH: Step 6 - instantiate SessionLogger
  DISPATCH->>LOGGER: SessionLogger(session_id)

  Note over DISPATCH: Step 7 - run skill checks
  DISPATCH->>SKILL: skill.run_checks(feature_dir, config, wp_id)
  SKILL-->>DISPATCH: list[CheckResult]

  Note over DISPATCH: Step 8 - determine outcome

  Note over DISPATCH: Step 9 - emit to stdout
  alt all checks passed
    DISPATCH->>OUTPUT: CliOutput.success(checks, artifacts)
    OUTPUT-->>AGENT: JSON ok, exit 0
  else any check failed
    DISPATCH->>OUTPUT: CliOutput.error(checks)
    OUTPUT-->>AGENT: JSON error, exit 1
  end

  Note over DISPATCH: Step 10 - write audit + debug logs (non-fatal)
  DISPATCH->>LOGGER: append_debug(DebugLogEntry)
  DISPATCH->>LOGGER: append_audit(AuditLogEntry)
```

---

### Workflow 6: Schema Loading and Validation

Schema loading is lazy and cached. The `SchemaLoader` reads YAML files on first use and
caches the derived Pydantic model class for the lifetime of the process.

```mermaid
flowchart TD
  REQUEST["SchemaLoader.load(artifact_type, schema_version)"]
  CACHE{"In cache?"}
  READ["Read YAML from<br/>schemas_dir/version/type.yaml"]
  MAP["Map type strings<br/>to Python types<br/>via _TYPE_MAP"]
  CREATE["pydantic.create_model()<br/>-> BaseModel subclass"]
  STORE["Store in cache"]
  RETURN["Return model class"]

  REQUEST --> CACHE
  CACHE -->|"yes"| RETURN
  CACHE -->|"no"| READ
  READ --> MAP
  MAP --> CREATE
  CREATE --> STORE
  STORE --> RETURN
```

**Type mapping** (`str` -> Python type):

| YAML type | Python type |
|-----------|-------------|
| `str` | `str` |
| `int` | `int` |
| `float` | `float` |
| `bool` | `bool` |
| `list` | `list` |
| `dict` | `dict` |

---

## Data Flow

### Artifact Frontmatter Contract

Artifacts are markdown files with YAML frontmatter. The schema YAML files define which
frontmatter fields are required, optional, and their types.

```mermaid
flowchart LR
  SCHEMAYAML["Schema YAML<br/>specs/.schemas/v1/spec.yaml<br/>fields: title, status, ..."]
  SCHEMALOADER["SchemaLoader<br/>derives Pydantic model"]
  PYDANTIC["SpecV1Model<br/>BaseModel subclass"]
  FRONTMATTER["spec.md frontmatter<br/>---<br/>title: My Feature<br/>status: draft<br/>---"]
  VALIDATE["model.model_validate(data)<br/>raises ValidationError<br/>on mismatch"]

  SCHEMAYAML -->|"loaded by"| SCHEMALOADER
  SCHEMALOADER -->|"creates"| PYDANTIC
  FRONTMATTER -->|"parsed by frontmatter.py"| VALIDATE
  PYDANTIC -->|"validates"| VALIDATE
```

### Output Envelope

Every invocation produces exactly one JSON object on stdout:

```mermaid
flowchart LR
  CHECKS["list of CheckResult<br/>name, passed, reason,<br/>artifact_path, field,<br/>expected, actual, rule"]
  RESULT["InvocationResult<br/>status: ok OR error<br/>skill: specify<br/>feature: 043-my-feature<br/>session_id: uuid<br/>message: summary<br/>artifacts: [paths]<br/>checks: [CheckResult]<br/>errors: [failed reasons]<br/>duration_ms: int"]
  STDOUT["stdout<br/>single-line JSON"]

  CHECKS --> RESULT
  RESULT --> STDOUT
```

---

### Workflow 7: JSON-First Implement Summary

After writing code, the AI agent creates a structured JSON summary rather than free-form prose.
The tool validates the JSON and renders both a persisted Markdown section and a stored JSON sidecar.

```mermaid
sequenceDiagram
  participant AGENT as AI Agent
  participant CLI as cli.py
  participant WORKFLOW as core/workflow.py
  participant FS as Filesystem

  AGENT->>CLI: spec-bridge-skill-tool generate-implement-summary-template
  CLI->>WORKFLOW: generate_implement_summary_template(feature_dir, wp_id)
  WORKFLOW->>FS: read summary-template.json from skills/implement/
  WORKFLOW-->>CLI: JSON template string
  CLI-->>AGENT: JSON template printed to stdout

  Note over AGENT: Agent fills all fields:<br/>prose, worktree, files_created,<br/>test_results, validator

  AGENT->>CLI: spec-bridge-skill-tool append-implement-summary --summary-json /tmp/summary.json
  CLI->>WORKFLOW: append_implement_summary(feature_dir, wp_id, json_str)
  WORKFLOW->>WORKFLOW: _validate_implement_summary_json()
  WORKFLOW->>WORKFLOW: _render_implement_summary_md()
  WORKFLOW->>FS: write WP<id>-implement-summary.json (machine-readable sidecar)
  WORKFLOW->>FS: append Markdown section to WP<id>.md (human-readable)
  WORKFLOW-->>AGENT: {"md_path": ..., "json_path": ...}
```

---

### Workflow 8: Versioned Review Summary Cycle

The review skill maintains a versioned set of review summaries. The cycle advances through
`requested` -> `implemented` -> re-review, repeating until `approved`.

```mermaid
stateDiagram-v2
  [*] --> requested : reviewer runs append-review-summary (verdict=fail)
  requested --> implemented : implement skill runs set-review-status implemented
  implemented --> approved : reviewer re-reads, all criteria pass
  implemented --> requested_v2 : reviewer finds remaining issues, new version created
  requested_v2 --> implemented_v2 : implement skill marks implemented
  implemented_v2 --> approved : reviewer approves
  approved --> [*] : accept skill validates lane done
```

**Key rules enforced by `core/workflow.py`**:
- If a `requested` review exists, the review skill must NOT create a new version -- it must
  check whether the implemented changes resolved the issues instead
- When the implement skill addresses changes, it calls `set-review-status implemented` to
  transition the current version from `requested` to `implemented`
- When the reviewer finds remaining unresolved issues, `append-review-summary` creates
  `v<N+1>` with `status: requested`
- When all criteria pass, `append-review-summary` sets `status: approved` (no new version needed)

---

## State Management

State is entirely file-system based. There is no in-memory state shared between invocations
beyond the schema cache (which lives only for the duration of a single process invocation).

| State type | Location | Format | Mutated by |
|------------|----------|--------|------------|
| Project config | `spec-bridge.conf` | YAML | `init` (once) |
| Artifact schemas | `specs/.schemas/v1/` | YAML | `init` (once) |
| Feature artifacts | `specs/<feature-slug>/` | YAML-frontmatter Markdown | AI agent |
| spec.md status | frontmatter `status:` in `spec.md` | YAML | `set-spec-status` workflow command |
| Decomposition artifact | `specs/<feature-slug>/decomposition.md` | YAML-frontmatter Markdown | AI agent (decompose skill) |
| Audit questions | `specs/<feature-slug>/questions.md` | YAML-frontmatter Markdown | AI agent (audit skill; audit-fix skill fills Answer: fields) |
| questions.md answered_count | frontmatter `answered_count:` in `questions.md` | YAML | AI agent (incremented after each verdict in audit-fix) |
| WP lane | frontmatter `lane:` field in WP files | YAML | Skill modules (read-only); AI agent (writes) |
| WP subsystem | frontmatter `subsystem:` field in WP files | YAML | AI agent (optional; enforced as advisory) |
| Implement summary | `tasks/WP<id>-implement-summary.json` + `.md section` | JSON + Markdown | `append-implement-summary` workflow command |
| Review summary | `tasks/WP<id>-review-summary-v<N>.json` + `.md section` | JSON + Markdown | `append-review-summary` workflow command |
| Review status | `status:` field in review summary JSON | JSON field | `set-review-status` + `append-review-summary` |
| Session debug log | `.spec-bridge/logs/<session-id>.debug.ndjson` | NDJSON | `dispatch` (append) |
| Session audit log | `.spec-bridge/logs/<session-id>.audit.ndjson` | NDJSON | `dispatch` (append) |

---

## Error Handling

```mermaid
flowchart TD
  INVOKE["Agent invokes skill"]
  SESSIONCHECK{"session-id<br/>present?"}
  SCHEMACHECK{"schema dir<br/>exists?"}
  FMCHECK{"frontmatter<br/>readable?"}
  SKILLCHECK{"all checks<br/>pass?"}
  PIPELINEERR{"unexpected<br/>pipeline error?"}

  SUCCESS["exit 0<br/>JSON ok"]
  FAIL_SESSION["exit 1 - JSON error<br/>session_id_provided: false<br/>rule: FR-024"]
  FAIL_SCHEMA["exit 1 - JSON error<br/>schema_dir_exists: false<br/>rule: FR-006b"]
  FAIL_FM["exit 1 - JSON error<br/>frontmatter_readable: false<br/>rule: FR-005"]
  FAIL_CHECKS["exit 1 - JSON error<br/>N failed checks with reasons"]
  FAIL_INTERNAL["exit 1 - JSON error<br/>pipeline_internal_error<br/>rule: internal-error"]

  INVOKE --> SESSIONCHECK
  SESSIONCHECK -->|"missing"| FAIL_SESSION
  SESSIONCHECK -->|"present"| SCHEMACHECK
  SCHEMACHECK -->|"missing"| FAIL_SCHEMA
  SCHEMACHECK -->|"exists"| FMCHECK
  FMCHECK -->|"unreadable"| FAIL_FM
  FMCHECK -->|"ok"| SKILLCHECK
  SKILLCHECK -->|"all pass"| SUCCESS
  SKILLCHECK -->|"any fail"| FAIL_CHECKS
  SKILLCHECK -->|"exception"| PIPELINEERR
  PIPELINEERR -->|"caught"| FAIL_INTERNAL
```

**Key invariant**: every failure path produces a JSON object on stdout containing a `checks`
array with `passed: false` entries and human-readable `reason` strings. The AI agent reads
`errors` (derived from failed check reasons) to understand what to fix.
