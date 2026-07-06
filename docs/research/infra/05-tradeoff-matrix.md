# Trade-off Matrix and Recommendation

> Side-by-side evaluation of all three alternatives against the requirements
> defined in `00-index.md`.

---

## Requirements Coverage

| Requirement | Alt A: Extend spec-bridge | Alt B: Purpose-built | Alt C: RFC-first controller | Alt D: Agent-as-orchestrator |
|------------|:------------------------:|:-------------------:|:--------------------------:|:---------------------------:|
| **R1**: RFC as source of truth | Partial — requires normalization to `infra-spec.md` | Yes — `ingest` skill parses RFCs directly | Yes — RFC drives the state machine natively | Yes — agent ingests RFC, tool validates the normalization |
| **R2**: Phase decomposition with cross-system deps | Yes — phase model with `depends_on` | Yes — DAG solver as core abstraction | Yes — DAG + gate dependencies | Yes — agent decomposes, tool validates DAG structure |
| **R3**: Track systems and ordering | Yes — `systems.yaml` manifest | Yes — `systems.yaml` + `SystemTarget` protocol | Yes — systems in config + per-phase gates | Yes — phase frontmatter tracks systems; agent manages ordering |
| **R4**: Validate config artifacts | Yes — extend existing schema validation | Yes — dedicated HCL/YAML/Helm validators | Partial — delegates to executors, gates verify outcomes | Yes — checks validate file content + structure on target branches |
| **R5**: Verify live system state | Partial — probes bolted onto skill checks | Yes — probe framework as core | Yes — gates are the verification layer | Partial — agent reports results, tool validates structure; `--live` mode opt-in |
| **R6**: Multi-repo support | Partial — significant extension to single-repo model | Yes — multi-repo native in config and workflow | Yes — repos are just system targets | Yes — executor prompts scope each phase to one repo; user bridges sessions |
| **R7**: Audit records | Yes — extends session logging | Yes — audit trail per phase | Yes — evidence model is inherently auditable | Yes — verify results + executor prompts form the audit trail |
| **R8**: RFC workflow integration | Partial — RFC → `infra-spec.md` translation | Good — Notion + markdown RFC ingestion | Best — RFC is the control document | Good — agent reads RFC natively; tool validates ingestion |
| **R9**: Dry-run / plan mode | Partial — probe `dry_run()` possible | Yes — `--dry-run` flag on verify | Yes — gate evaluation without execution | Yes — prompt generation without execution is the default |
| **R10**: Instruction-driven (any LLM) | Yes — SKILL.md files via spec-bridge adapters | Yes — SKILL.md files, independent templates | Partial — controller is a program, not instructions; agent executor generates instructions | Best — everything is SKILL.md + executor prompts; any agent can play either role |
| **R11**: Reuse spec-bridge concepts | Best — same codebase | Moderate — borrows principles, not code | Low — different mental model (reconciliation vs validation) | Best — identical philosophy: tool validates, agent orchestrates |
| **R12**: Rollback verification | Yes — `infra-decommission` skill | Yes — `decommission` skill | Yes — decommission gates | Yes — `close` skill validates decommission checks |
| **R13**: CI/CD integration | Possible — external probes | Good — probe framework shells out to CI APIs | Best — CI executor as first-class executor type | Good — executor prompts can target CI; verify checks pipeline status |
| **R14**: Progressive disclosure | Good — fewer phases for simple changes | Good — same | Fair — gate/evidence model has baseline complexity | Best — 2-phase RFC = 2 prompts; no baseline ceremony from the tool |

### Coverage Summary

| Alternative | Must Have (R1-R7) | Should Have (R8-R11) | Nice to Have (R12-R14) |
|------------|:-----------------:|:-------------------:|:---------------------:|
| A: Extend spec-bridge | 5/7 full, 2/7 partial | 2/4 full, 2/4 partial | 2/3 full, 1/3 partial |
| B: Purpose-built | 7/7 full | 3/4 full, 1/4 moderate | 3/3 full |
| C: RFC-first controller | 6/7 full, 1/7 partial | 2/4 full, 2/4 partial | 2/3 full, 1/3 fair |
| D: Agent-as-orchestrator | 6/7 full, 1/7 partial | 4/4 full | 3/3 full |

---

## Qualitative Dimensions

### Implementation Effort

| Dimension | Alt A | Alt B | Alt C | Alt D |
|-----------|-------|-------|-------|-------|
| New code required | ~2000 LOC (skills + probes + multi-repo) | ~3500 LOC (full tool) | ~4500 LOC (state machine + gates + executors) | ~1500 LOC (skills + checks + prompt schema) |
| Shared code reused | ~1500 LOC (dispatch, logging, frontmatter, output) | ~500 LOC (patterns borrowed, reimplemented) | ~200 LOC (minimal sharing) | ~1500 LOC (identical patterns to spec-bridge) |
| New abstractions | 3 (phases, probes, system manifest) | 4 (phases, probes, system targets, DAG) | 6 (state machine, gates, evidence, executors, DAG, reconciler) | 2 (executor prompts, shell checks) |
| Time to MVP | 2-3 weeks | 4-5 weeks | 6-8 weeks | 2-3 weeks |
| Time to production | 4-6 weeks | 6-8 weeks | 10-12 weeks | 3-5 weeks |

### Maintainability

| Dimension | Alt A | Alt B | Alt C | Alt D |
|-----------|-------|-------|-------|-------|
| Codebase complexity | High — spec-bridge grows to 17 skills | Moderate — focused tool | High — many abstractions | Low — same shape as spec-bridge |
| Cognitive load | High — one tool does two things | Low — purpose-built | Moderate — powerful but complex | Low — spec-bridge users already know the pattern |
| Independent releases | No — shared release with spec-bridge | Yes | Yes | Yes (or shared with spec-bridge as infra skills) |
| Test surface | Large — must test infra + SDD interactions | Focused | Large — state machine combinatorics | Small — checks are pure functions |

### Operational Risk

| Dimension | Alt A | Alt B | Alt C | Alt D |
|-----------|-------|-------|-------|-------|
| Credential exposure | Moderate — probes in the same binary as SDD tool | Moderate — probes are core | Low — controller is read-only; executors hold creds | Lowest — tool has no creds by default; `--live` opt-in |
| Blast radius of bugs | High — bug in probe could affect SDD skills | Low — isolated tool | Low — controller can't modify infra | Lowest — tool only reads files and optionally shells out |
| Dependency risk | Moderate — optional deps or shell-out | Same | Same | None — stdlib only (like spec-bridge); `--live` needs CLI tools installed |

---

## Decision Factors

### When to choose Alternative A (Extend spec-bridge)

Choose this if:
- The team primarily uses spec-bridge today and wants a unified experience
- Infrastructure changes are infrequent (1-2 per quarter)
- The shared dispatch/logging/frontmatter code provides genuine value
- You're willing to accept increased complexity in the spec-bridge codebase
- Time to first value is the priority

Avoid this if:
- Multi-repo is a hard requirement from day one
- Live system verification is the primary value proposition
- The spec-bridge maintainer(s) are concerned about scope creep

### When to choose Alternative B (Purpose-built harness)

Choose this if:
- Multi-repo and live verification are non-negotiable
- The team wants a focused tool that does one thing well
- Independent evolution from spec-bridge is important
- The team has capacity to build and maintain a second tool
- RFCs are already written in a consistent format the tool can ingest

Avoid this if:
- The duplicated infrastructure (dispatch, logging, etc.) is unacceptable
- The team wants a single tool to learn and operate
- Build time of 4-5 weeks to MVP is too long

### When to choose Alternative C (RFC-first controller)

Choose this if:
- The RFC process is mature and consistent across the team
- You want a principled separation between "what must be true" (gates) and
  "how to make it true" (executors)
- Mixed automation levels matter (some phases automated, others manual)
- Auditability is a hard requirement (evidence model)
- You're building for a future where the controller runs continuously
  (like a GitOps operator)

Avoid this if:
- The additional abstraction layers (gates, evidence, executors, reconciler) are
  overkill for the current scale of operations
- The team prefers instruction-driven tools over program-driven controllers
- 10-12 weeks to production is too long
- The RFC format varies significantly between authors

### When to choose Alternative D (Agent-as-orchestrator)

Choose this if:
- You believe the LLM agent is the right orchestrator (not a programmatic controller)
- Fidelity to spec-bridge's philosophy matters (tool validates, agent drives)
- You want the fastest path to MVP with the lowest tool complexity
- Executor prompts as portable, auditable artifacts appeal to you
- The team is comfortable with a two-agent workflow (planner + executor)
- Zero runtime dependencies matters (stdlib-only tool)
- You want the tool to remain safe by default (no write access to anything)

Avoid this if:
- Unattended overnight execution is a hard requirement from day one
- User fatigue from carrying prompts between sessions is unacceptable
- You need the tool itself to verify live system state (not trust the agent's report)
- The team doesn't use LLM agents heavily and wants a standalone automation tool

---

## Hybrid Approaches

The alternatives are not mutually exclusive. Two hybrid paths are worth considering:

### Hybrid 1: B + shared library extracted from A

1. Extract `spec-bridge-core` from spec-bridge-v2: dispatch, logging, frontmatter,
   output, session management.
2. Build the infra harness (Alternative B) as a separate project that depends on
   `spec-bridge-core`.
3. Refactor spec-bridge-v2 to also depend on `spec-bridge-core`.

**Pros**: Shared code without shared scope. Independent releases. Each tool is focused.
**Cons**: Three packages to maintain. `spec-bridge-core` must be stable or both tools
are blocked.

### Hybrid 2: B now, C later

1. Build Alternative B as the initial implementation — focused, multi-repo-native,
   probe-based.
2. Once the probe framework and multi-repo patterns are proven, evolve toward C by
   adding the gate/evidence/reconciler layer on top.
3. The `verify` skill becomes the gate evaluator. Executors wrap the `implement` skill.

**Pros**: Incremental path. Ship value early with B, gain sophistication with C.
**Cons**: Risk of architecture churn. B's skill-based model may not cleanly evolve
into C's controller model.

---

## Recommendation (Revised)

**Start with Alternative D (agent-as-orchestrator) named `ops-bridge`,
with the option to adopt B's probe framework later for `--live` mode.**

Rationale:

1. **Truest to the spec-bridge philosophy**. The original insight — that an LLM agent
   is a better orchestrator than any program we write, and the tool should only provide
   deterministic verification — applies even more strongly to infrastructure. Infra
   operations involve ambiguity, judgment calls, and context-switching that a state
   machine handles poorly but an agent handles naturally.

2. **Lowest complexity, fastest path to value**. Alt D needs ~1500 LOC and 2-3 weeks
   to MVP. The tool surface is nearly identical to spec-bridge: dispatch, checks,
   frontmatter, JSON verdicts. No new paradigms to learn.

3. **Executor prompts are the killer artifact**. A portable, self-contained instruction
   file that any agent (or human) can execute — this solves the multi-repo problem
   elegantly without any multi-repo machinery in the tool. The prompt IS the interface
   contract between the planner and executor.

4. **Zero-dependency tool, safe by default**. Like spec-bridge, the tool only reads
   files and optionally shells out. No kubernetes client, no boto3, no API tokens.
   The tool cannot break infrastructure because it never touches infrastructure.

5. **Multi-repo without multi-repo code**. The two-agent pattern with executor prompts
   naturally spans repositories without the tool needing to clone repos, manage
   credentials, or coordinate across workspaces. Each prompt is scoped to one repo.

6. **Natural evolution path**. Start with structural validation (trust the agent).
   Add `--live` mode (shell out to verify) when confidence grows. Integrate with
   Cursor SDK for automated prompt dispatch later. The architecture doesn't change —
   only the verification depth.

### Recommended First Steps

1. Create `ops-bridge` as a new directory under spec-bridge-v2 (shared repo, independent package)
2. Define schemas: `infra-spec.yaml`, `phase.yaml`, `executor-prompt.yaml`, `verify-result.yaml`
3. Implement skills: `ingest`, `plan`, `prompts`, `verify`, `close`
4. Implement checks: `file_checks`, `git_checks`, `shell_checks` (optional, for `--live`)
5. Write SKILL.md templates for each skill
6. Validate against RFC-017 as the first real use case
7. Iterate on executor prompt quality — this is the make-or-break artifact
