# Alternative D: Agent-as-Orchestrator with Deterministic Validation

> **Approach**: The LLM agent is the control plane. A deterministic validation tool
> (like spec-bridge) only checks outcomes — it never orchestrates, schedules, or
> reconciles. One of the key artifacts is **executor prompts**: instructions that the
> user hands to a second agent session to perform the actual infrastructure changes.
> The first agent then validates the result.
> **Working name**: "ops-bridge" or "runbook-bridge"

---

## Core Idea

Alternative C introduces a programmatic controller (state machine, reconciler, executors)
that drives the process. This alternative **removes all of that** and returns to
spec-bridge's original philosophy:

> The tool is **not** an orchestrator. Skills encode all workflow logic as AI agent
> instructions. The agent calls this tool at the end to get a pass/fail verdict.
> — spec-bridge-v2 README

The insight is: **the LLM is already a better orchestrator than any state machine we
could write**. It understands context, adapts to failures, asks clarifying questions,
and coordinates across sessions. What it lacks is **deterministic verification** — the
ability to distinguish "I think this worked" from "I can prove this worked."

The tool provides that verification. Nothing more.

**Two-agent pattern:**

```
┌─────────────────────────────────────────────────────────────┐
│  Agent 1 (Planner + Validator)                              │
│  - Reads RFC                                                │
│  - Decomposes into phases                                   │
│  - Produces EXECUTOR PROMPTS for each phase                 │
│  - After execution: runs deterministic validation tool      │
│  - Advances to next phase or reports failures               │
└────────────────────────────────────┬────────────────────────┘
                                     │
                          executor prompts (artifacts on disk)
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent 2 (Executor) — separate session / window / worktree  │
│  - Receives prompt with full context for ONE phase          │
│  - Makes configuration changes in target repos              │
│  - Runs verification commands as instructed                  │
│  - Reports results back (files on disk / commit messages)   │
└─────────────────────────────────────────────────────────────┘
```

The user is the bridge between the two agents. They take the executor prompt
from Agent 1, open a new session (different repo, different context), paste the
prompt, let Agent 2 do the work, then return to Agent 1 for validation.

---

## Why Two Agents?

Infrastructure changes span multiple repositories. An LLM agent session is
typically scoped to one workspace. The two-agent pattern solves this naturally:

- **Agent 1** lives in the spec/planning repo (or the RFC repo). It has the full
  picture: what the RFC says, which phases exist, what's been validated so far.
- **Agent 2** lives in the target repo (e.g., `bf-container-base-images`,
  `ci-templates`, `bf-terraform`). It has deep context on that specific codebase
  and makes changes there.

The executor prompt is the **interface contract** between them. It contains
everything Agent 2 needs to act without needing Agent 1's full context.

This mirrors how platform engineers actually work: one person holds the RFC
plan in their head, and they (or another engineer) execute changes in each repo.

---

## Architecture

```
ops-bridge/
├── src/ops_bridge/
│   ├── __main__.py          # CLI entrypoint
│   ├── config.py            # Project config (ops-bridge.yaml)
│   │
│   ├── core/
│   │   ├── dispatch.py      # Skill dispatch (same pattern as spec-bridge)
│   │   ├── output.py        # JSON verdict on stdout
│   │   ├── logging.py       # Session + audit logging
│   │   └── frontmatter.py   # YAML frontmatter parsing
│   │
│   ├── skills/
│   │   ├── ingest/          # RFC → infra-spec.md (validate RFC structure)
│   │   ├── plan/            # infra-plan.md + phases (validate phase structure)
│   │   ├── prompts/         # Validate executor prompts are complete
│   │   ├── verify/          # Validate phase outcomes (the core value)
│   │   └── close/           # Validate all phases done + decommission
│   │
│   ├── checks/
│   │   ├── protocol.py      # Check Protocol (same as spec-bridge CheckResult)
│   │   ├── file_checks.py   # File exists, contains string, YAML parses
│   │   ├── shell_checks.py  # Run command, check exit code + output
│   │   ├── git_checks.py    # Branch exists, file on branch, commit message
│   │   └── composite.py     # AND/OR check combinators
│   │
│   └── adapters/
│       ├── cursor.py        # Generate .cursor/skills/ SKILL.md files
│       └── templates/       # SKILL.md templates per skill
│           ├── ingest.md
│           ├── plan.md
│           ├── prompts.md
│           ├── verify.md
│           └── close.md
│
├── schemas/v1/
│   ├── infra-spec.yaml      # RFC-derived spec frontmatter
│   ├── phase.yaml           # Phase file frontmatter
│   ├── executor-prompt.yaml # Executor prompt frontmatter
│   └── verify-result.yaml   # Verification result schema
│
└── ops-bridge.yaml          # Project config
```

**What's NOT here** (compared to Alternative C):
- No `state_machine.py` — the agent tracks state via phase frontmatter lanes
- No `reconciler.py` — the agent decides what to do next
- No `executors/` — the agent generates prompts; the user dispatches them
- No `evidence.py` — verification is done by running checks, not collecting evidence
- No `gates/` — replaced by `checks/` which are simpler (pass/fail, no state)

---

## Key Artifacts

### 1. `infra-spec.md` — Normalized RFC

```yaml
---
title: "Replace BuildKitd with Rootless Podman"
rfc_source: "./RFC-017-replace-buildkitd-with-podman.md"
status: planned        # planned → in_progress → done
systems_count: 7
phases_count: 6
created_at: "2026-05-11"
---

## Summary
[Extracted from RFC]

## Systems
[List of systems with their types and access methods]

## Success Criteria
[Extracted from RFC's Success Metrics section]
```

### 2. `phases/Pxx-slug.md` — Phase Definition

```yaml
---
phase_id: P01
title: "Add Podman to bf-runner-allinone"
lane: planned          # planned → doing → done
depends_on: []
target_systems:
  - id: bf-container-base-images
    type: git-repo
    url: git@gitlab.com:bridgefund/bf-container-base-images.git
changes_summary: "Add podman, buildah, fuse-overlayfs to runner Dockerfile"
verification:
  - check: shell
    command: "podman --version"
    expect_contains: "podman version"
    context: "Inside a runner pod after new image is deployed"
  - check: ci_pipeline
    project: bf-container-base-images
    job: build-runner
    expect: success
history: []
---

## Description

[What this phase achieves and why, extracted from RFC implementation plan]

## Changes Required

[Detailed description of what configuration changes are needed]

## Verification Criteria

[Human-readable description of how to know this phase succeeded]
```

### 3. `prompts/Pxx-executor.md` — Executor Prompt (the key artifact)

This is what the user gives to Agent 2. It's a complete, self-contained instruction
set for making the changes in one phase:

```yaml
---
phase_id: P01
title: "Add Podman to bf-runner-allinone"
target_repo: git@gitlab.com:bridgefund/bf-container-base-images.git
branch: infra/rfc-017-podman-p01
generated_by: "ops-bridge plan"
generated_at: "2026-05-11T10:00:00Z"
---

# Executor Prompt: P01 — Add Podman to bf-runner-allinone

## Context

You are implementing Phase 1 of RFC-017 (Replace BuildKitd with Rootless Podman).
This phase adds Podman and Buildah to the `bf-runner-allinone` Docker image so that
CI jobs can build container images without a shared buildkitd daemon.

## Target

- **Repository**: `bf-container-base-images`
- **Branch**: Create `infra/rfc-017-podman-p01` from `main`
- **Working directory**: `bf-runner-allinone/`

## Changes

1. **Modify `bf-runner-allinone/Dockerfile`**:
   - Add `podman`, `buildah`, and `fuse-overlayfs` packages
   - Add a `COPY containers.conf /etc/containers/containers.conf` instruction

2. **Create `bf-runner-allinone/containers.conf`**:
   ```toml
   [containers]
     default_capabilities = [
       "CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL",
       "NET_BIND_SERVICE", "SETFCAP", "SETGID", "SETPCAP", "SETUID",
     ]

   [engine]
     cgroup_manager = "cgroupfs"
     events_logger = "file"
   ```

## Verification Commands

After making changes, run these commands and include the output in your response:

```bash
# Verify Dockerfile syntax
docker build --check -f bf-runner-allinone/Dockerfile .

# Verify containers.conf is valid TOML
python3 -c "import tomllib; tomllib.load(open('bf-runner-allinone/containers.conf', 'rb'))"
```

## Commit Message

```
feat(runner): add podman and buildah to bf-runner-allinone

Part of RFC-017: Replace BuildKitd with Rootless Podman (Phase 1).
Adds rootless container build capability directly in the runner image.
```

## Done When

- [ ] Branch `infra/rfc-017-podman-p01` exists with the changes
- [ ] Dockerfile parses without errors
- [ ] containers.conf is valid TOML
- [ ] Changes are committed with the specified message format
```

### 4. `phases/Pxx-verify-results.json` — Verification Output

After Agent 2 executes, Agent 1 runs the validation tool:

```json
{
  "phase_id": "P01",
  "skill": "verify",
  "status": "ok",
  "checks": [
    {
      "name": "branch_exists",
      "passed": true,
      "actual": "infra/rfc-017-podman-p01",
      "expected": "infra/rfc-017-podman-p01"
    },
    {
      "name": "file_modified",
      "passed": true,
      "artifact_path": "bf-runner-allinone/Dockerfile",
      "expected": "contains 'podman'",
      "actual": "line 47: RUN apt-get install -y podman buildah fuse-overlayfs"
    },
    {
      "name": "file_created",
      "passed": true,
      "artifact_path": "bf-runner-allinone/containers.conf"
    },
    {
      "name": "ci_pipeline",
      "passed": true,
      "expected": "build-runner job succeeds",
      "actual": "pipeline #12345 passed"
    }
  ],
  "errors": [],
  "duration_ms": 3400
}
```

---

## Lifecycle (Agent 1's Perspective)

The agent reads the SKILL.md and follows this flow. The tool only appears at
validation checkpoints — everything else is the agent's judgment:

```
1. Agent reads SKILL.md for 'ingest'
2. Agent reads the RFC, creates infra-spec.md
3. Agent calls: ops-bridge ingest --feature rfc-017 --session-id <uuid>
   → Tool validates: RFC sections present, systems enumerated, schema valid
   → JSON verdict: pass/fail

4. Agent reads SKILL.md for 'plan'
5. Agent decomposes RFC into phases, creates phase files + systems manifest
6. Agent calls: ops-bridge plan --feature rfc-017 --session-id <uuid>
   → Tool validates: DAG acyclic, all deps exist, verification defined per phase
   → JSON verdict: pass/fail

7. Agent reads SKILL.md for 'prompts'
8. Agent generates executor prompts for each phase (prompts/P01-executor.md, ...)
9. Agent calls: ops-bridge prompts --feature rfc-017 --session-id <uuid>
   → Tool validates: prompt covers all changes, has verification commands, has branch name
   → JSON verdict: pass/fail

10. USER takes prompts/P01-executor.md → opens Agent 2 in target repo → executes

11. Agent reads SKILL.md for 'verify'
12. Agent runs verification checks for the phase
13. Agent calls: ops-bridge verify --feature rfc-017 --phase P01 --session-id <uuid>
    → Tool validates: checks defined in phase file all pass
    → JSON verdict: pass/fail
    → If pass: agent updates P01 lane to 'done', proceeds to next phase

14. Repeat 10-13 for each phase in dependency order

15. Agent reads SKILL.md for 'close'
16. Agent confirms all phases done, decommission verified
17. Agent calls: ops-bridge close --feature rfc-017 --session-id <uuid>
    → Tool validates: all phases lane=done, decommission checks pass
    → JSON verdict: pass/fail
```

---

## What the Tool Validates (Per Skill)

### `ingest`

| Check | What it verifies |
|-------|-----------------|
| `rfc_source_readable` | The RFC file exists and is non-empty |
| `infra_spec_exists` | `infra-spec.md` was created |
| `infra_spec_frontmatter_valid` | Frontmatter matches schema |
| `systems_identified` | At least one system listed |
| `success_criteria_present` | Success criteria section is non-trivial |

### `plan`

| Check | What it verifies |
|-------|-----------------|
| `phases_exist` | At least one phase file created |
| `dag_acyclic` | Phase dependencies form a DAG |
| `deps_exist` | Every `depends_on` reference points to a real phase |
| `verification_defined` | Every phase has at least one verification check |
| `systems_covered` | Every system in `infra-spec.md` is targeted by at least one phase |

### `prompts`

| Check | What it verifies |
|-------|-----------------|
| `prompt_per_phase` | Every phase has a corresponding executor prompt |
| `prompt_frontmatter_valid` | Prompt frontmatter matches schema |
| `prompt_has_target` | Prompt specifies target repo and branch |
| `prompt_has_changes` | Prompt describes what to change |
| `prompt_has_verification` | Prompt includes verification commands |
| `prompt_has_done_criteria` | Prompt defines "done when" checklist |

### `verify` (per phase)

| Check | What it verifies |
|-------|-----------------|
| `phase_deps_done` | All dependency phases have lane=done |
| `verification_checks_pass` | All checks defined in phase file pass |
| `branch_exists` | Target branch exists in the repo (if git-repo type) |
| `changes_present` | Expected file changes are on the branch |

Verification checks are **executed by the agent, not the tool**. The tool validates
that the agent *reported* running them and the results match expectations. This keeps
the tool dependency-free (no kubectl, no terraform, no boto3).

**Critical design decision**: The tool trusts the agent's reported check output. If
the agent says `kubectl get deploy -n gitlab-runner` returned empty, the tool accepts
that. The tool validates *structure* (did you run the checks? do the results satisfy
the criteria?) not *execution* (did kubectl actually return that?).

For higher assurance, the tool CAN shell out to run checks itself — but this is
opt-in via a `--live` flag, not the default. The default mode is **structural
validation** identical to spec-bridge.

### `close`

| Check | What it verifies |
|-------|-----------------|
| `all_phases_done` | Every phase has lane=done |
| `spec_status_done` | `infra-spec.md` status is `done` |
| `decommission_verified` | Decommission checks (if any) pass |

---

## The Executor Prompt as a First-Class Artifact

The executor prompt is this alternative's unique contribution. It is:

1. **A complete instruction set** — Agent 2 needs nothing else to act. No prior
   context, no access to the plan, no knowledge of other phases.

2. **Auditable** — The prompt records exactly what was asked. If the change goes
   wrong, you can review what instructions were given.

3. **Replayable** — If a phase fails, give the same prompt to a different agent
   (or a human) and try again. The prompt is idempotent in intent.

4. **Scope-limited** — Each prompt targets ONE repo and ONE branch. This matches
   how LLM agent sessions work (one workspace at a time).

5. **Verifiable** — The prompt includes its own verification commands. Agent 2
   runs them and reports. Agent 1 validates the report.

### Prompt Quality Checks

The `prompts` skill validates that executor prompts are good enough to hand off:

- **Context section**: Does it explain *why* this change is being made?
- **Target section**: Repo URL, branch name, working directory
- **Changes section**: Specific files to create/modify with expected content
- **Verification section**: Commands to run after changes
- **Done criteria**: Checklist the executor can self-evaluate against
- **Commit message**: Consistent format referencing the RFC

A bad prompt (missing context, vague changes, no verification) will fail validation
just like a bad `spec.md` fails spec-bridge's specify check.

---

## Comparison with Alternative C

| Dimension | Alt C: RFC-First Controller | Alt D: Agent-as-Orchestrator |
|-----------|:-------------------------:|:---------------------------:|
| Who orchestrates? | Programmatic reconciler | LLM agent (with user) |
| What does the tool do? | Track state, evaluate gates, dispatch executors | Validate artifacts and outcomes |
| State machine? | Yes — built into the tool | No — agent manages lane transitions |
| Executor model? | Pluggable executors in the tool | Executor prompts (artifacts on disk) |
| Evidence model? | Structured evidence submission API | Agent reports check results |
| How phases advance? | Reconciler evaluates gates | Agent updates frontmatter after verification passes |
| Complexity | 6 abstractions | 2 abstractions (skills + checks) |
| Matches spec-bridge philosophy? | No (tool is a controller) | Yes (tool only validates) |
| Multi-repo coordination? | Controller dispatches to repos | User carries prompts between agent sessions |
| Failure handling? | Reconciler retries / blocks | Agent decides (ask user, retry, skip) |

---

## Trade-offs

### Advantages

- **True to spec-bridge's philosophy**: The tool validates, the agent orchestrates.
  Same mental model, same patterns, same kind of SKILL.md instructions. A team
  that knows spec-bridge already understands how this works.

- **Minimal tool complexity**: No state machine, no reconciler, no executor
  framework. The tool is a set of checks that read files and optionally run
  commands. Same architecture as spec-bridge-skill-tool.

- **Executor prompts are portable**: The prompt is a markdown file. Give it to
  Cursor, Claude Code, Copilot, or a human. It doesn't care who reads it. This
  is the strongest form of "instruction-driven, not platform-locked."

- **Natural multi-repo**: The two-agent pattern matches how multi-repo work
  actually happens. You don't need a tool that coordinates across repos — you
  need a tool that validates each repo's contribution independently.

- **Agent handles ambiguity**: When Phase 3 fails unexpectedly, the agent can
  reason about why, propose a fix, regenerate the prompt, or ask the user.
  A state machine would just block.

- **Fast to build**: The tool surface is almost identical to spec-bridge. Same
  dispatch, same checks, same output. The new parts are the check types (shell,
  git) and the prompt schema. MVP in 2-3 weeks.

- **Progressive disclosure**: A simple RFC with 2 phases generates 2 prompts.
  A complex RFC with 6 phases and parallel branches generates 6 prompts.
  The tool's complexity doesn't change — only the number of artifacts.

### Disadvantages

- **User is the message bus**: The user must manually carry prompts from Agent 1
  to Agent 2. For a 6-phase RFC, that's 6 round-trips between sessions. This
  could be tedious for large migrations.

- **No automated progression**: Unlike Alt C where the reconciler can run
  unattended, this approach requires the user to be present for every phase
  transition. There's no "run overnight and check in the morning."

- **Trust in agent-reported results**: The tool (in default mode) trusts what
  the agent says the check output was. If the agent hallucinates a successful
  `kubectl get` result, the tool can't catch it without `--live` mode.

- **No parallel execution tracking**: Alt C's DAG solver can dispatch
  independent phases in parallel. Here, the agent could suggest parallel
  execution, but tracking multiple in-flight phases with their prompts adds
  cognitive load on the user.

- **Executor prompt quality depends on Agent 1**: If the planner agent writes
  a vague or incorrect prompt, Agent 2 will produce wrong results. The
  `prompts` skill validates structure but can't validate semantic correctness.

### Risk: "Telephone Game"

Information passes through three hops: RFC → Agent 1 (planner) → prompt →
Agent 2 (executor). Each hop can lose nuance or introduce errors. The prompt
is the critical interface — if it's lossy, the whole system degrades.

**Mitigation**: The `prompts` skill enforces completeness. The prompt must
contain enough context that Agent 2 can act without the RFC. The verification
commands in the prompt create a feedback loop that catches execution errors
even if the prompt was slightly off.

### Risk: "User Fatigue on Large Migrations"

A 6-phase RFC means the user opens at least 12 sessions (6 executor sessions +
returns to the planner 6 times for verification). For a 20-phase migration,
this becomes impractical.

**Mitigation**: Phase batching. The agent can generate prompts for independent
phases and tell the user: "Phases P01, P02, and P04 are independent. Execute
them in any order, then return for verification." This reduces round-trips.

Future enhancement: integrate with Cursor's multi-agent / worktree features to
dispatch prompts to parallel sessions automatically.

---

## How It Handles the RFC-017 Example

**Agent 1 session** (in the planning repo):

```
User: "Implement RFC-017. Here's the RFC file."

Agent 1:
  1. Reads RFC-017
  2. Creates infra-spec.md (systems: 7 repos + 1 cluster)
  3. Calls: ops-bridge ingest --feature rfc-017 --session-id abc123
     → pass

  4. Decomposes into 6 phases with dependencies
  5. Creates phases/P01.md through phases/P06.md
  6. Calls: ops-bridge plan --feature rfc-017 --session-id abc123
     → pass

  7. Generates executor prompts for each phase
  8. Calls: ops-bridge prompts --feature rfc-017 --session-id abc123
     → pass

  9. "Phases P01 and P02 are independent. Here's the first prompt.
      Open bf-container-base-images in a new session and paste this:"
      [shows prompts/P01-executor.md]
```

**User opens Agent 2** in `bf-container-base-images`:

```
User: [pastes P01 executor prompt]

Agent 2:
  1. Creates branch infra/rfc-017-podman-p01
  2. Modifies Dockerfile (adds podman, buildah, fuse-overlayfs)
  3. Creates containers.conf
  4. Runs verification commands
  5. Commits with specified message
  6. "Done. Branch created, Dockerfile builds, containers.conf is valid TOML."
```

**User returns to Agent 1**:

```
User: "P01 is done. The branch exists and pipeline passed."

Agent 1:
  1. Runs verification for P01
  2. Calls: ops-bridge verify --feature rfc-017 --phase P01 --session-id abc123
     → pass (branch exists, file contains 'podman', CI green)
  3. Updates P01 lane to 'done'
  4. "P01 verified. P02 is also independent — here's the next prompt:"
     [shows prompts/P02-executor.md]
```

**Repeat until all 6 phases are done, then:**

```
Agent 1:
  1. All phases verified
  2. Calls: ops-bridge close --feature rfc-017 --session-id abc123
     → pass
  3. "RFC-017 is fully implemented and verified. All 6 phases complete."
```

---

## Future: Automating the User-as-Bridge

The two-agent pattern with user-as-bridge is the **correct starting architecture**
because it's the simplest thing that works. But the user carrying prompts is a
UX limitation, not a fundamental architectural constraint.

Future enhancements that preserve the architecture:

1. **Cursor worktree integration**: Agent 1 uses the `conductor` skill to spawn
   a worktree for the target repo, pre-loads the executor prompt, and the user
   just switches windows.

2. **SDK-based dispatch**: Using `@cursor/sdk`, Agent 1 programmatically spawns
   Agent 2 sessions with the executor prompt pre-loaded. The user approves
   the dispatch but doesn't copy-paste.

3. **CI as executor**: For phases that are pure config changes + pipeline runs,
   the prompt could be converted into a CI job that a webhook triggers. Agent 1
   monitors the pipeline and validates when complete.

None of these change the tool's architecture. The tool still only validates.
The orchestration layer evolves from "user carries prompts" to "tooling carries
prompts" without touching the validation harness.
