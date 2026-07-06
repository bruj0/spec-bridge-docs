# ADR 0008: Audit and Audit-Fix Skill Workflows

**Status**: Accepted
**Date**: 2026-03-22
**Deciders**: Platform team

---

## Context

The SDD workflow (specify -> plan -> tasks -> implement -> review -> accept -> merge) assumes a
feature starts from a blank slate: a developer writes a spec, generates a plan, and implements
work packages from scratch. This model does not address a common real-world entry point:
**an existing, unfamiliar codebase that must be understood and improved before new work begins**.

Three capabilities were missing:

1. A structured way to produce a catalogue of questions about an existing codebase (risks,
   ambiguities, invariant violations, documentation drift).
2. An interactive session to answer those questions collaboratively with the codebase owner,
   with research detour support.
3. A path from answered questions to a schema-compatible `plan.md` that feeds the existing
   SDD workflow without bypassing it.

The simplest extension would have been to add these steps to an existing skill (e.g., extend
`specify` to accept an audit mode). Alternatively, they could be encoded entirely in SKILL.md
instructions with no tool-side validation.

---

## Decision

**Two new standalone skill modules** are introduced: `audit` and `audit-fix`. Each is a
self-contained module in `skill_tool/skills/` with its own `skill.py`, tests, and registered
`SkillOutputContract`. Two new CLI subcommands (`audit`, `audit-fix`) are added. Two new adapter
templates (`audit.md`, `audit-fix.md`) are added to `adapters/templates/`.

The workflow is:

```
spec-bridge-audit       -> questions.md (thematic Q catalogue with Answer: placeholders)
spec-bridge-audit-fix   -> questions.md (all answers filled) + plan.md
spec-bridge-plan        -> plan.md (normal SDD plan validation, reused here)
spec-bridge-tasks       -> work packages (normal SDD tasks, unchanged)
```

`audit-fix` reuses `spec-bridge-plan`'s validator for the generated `plan.md` (dual-call
validation: `audit-fix` checks completion, `plan` checks schema compliance). No new artifact
schema is introduced for `plan.md`.

A new artifact schema, `questions.yaml`, is introduced for `questions.md` frontmatter.

---

## Rationale

### Separate skills, not extensions of existing skills

The `audit` and `audit-fix` skills have distinct preconditions, output artifacts, and
completion criteria from any existing skill. Folding them into `specify` or another skill would
violate the single-responsibility principle and break the skill isolation rule (ADR-003):
skills must not depend on each other's module code. Standalone skills keep each skill's
acceptance contract clear and testable in isolation.

### questions.md as the single questions artifact

All audit findings are encoded in a single `questions.md` file rather than per-question files
or a database. This keeps the artifact human-readable and directly editable by the developer.
The frontmatter (`feature_slug`, `question_count`, `answered_count`, `audit_mode`,
`import_source`) provides the machine-readable state needed for tool-side validation without
requiring the tool to parse question body content.

The tool never counts questions by scanning body content. It trusts the frontmatter
`question_count` and `answered_count` fields, which the agent writes and the tool validates.
This preserves the two-responsibility contract (ADR-002): the tool validates, the agent writes.

### Import mode for existing questions files

The audit skill supports two modes: `review` (agent generates questions from scratch) and
`import` (agent normalises an existing questions/review file into the canonical format). Import
mode was included because teams often have existing review artefacts (Notion pages, Markdown
files, Google Docs exports) that should not require re-doing the review. The agent applies a
label alias table (e.g., `**Impact:**` -> `**Why this matters:**`) to normalise without loss.

The distinction is recorded in `audit_mode` frontmatter so `audit-fix` and downstream tools
know the provenance of the questions.

### Dual-call validation in audit-fix

`spec-bridge-audit-fix` calls two validators in sequence:

1. `spec-bridge-skill-tool audit-fix` -- checks `answered_count == question_count`.
2. `spec-bridge-skill-tool plan` -- checks the generated `plan.md` against the plan schema.

Reusing the existing `plan` validator for the second check avoids duplicating plan schema
validation logic in `audit-fix`. It also means audit-derived plans are held to exactly the same
schema standard as spec-derived plans, keeping the downstream `tasks` skill agnostic to how
`plan.md` was produced.

### Interactive resolution session with WAITING_FOR_VERDICT

The audit-fix adapter template presents questions one at a time and ends each turn with the
sentinel `WAITING_FOR_VERDICT`. This mirrors the `WAITING_FOR_DISCOVERY_INPUT` pattern used in
the `specify` adapter. The rationale is the same: without an explicit sentinel, agents may
process multiple questions in a single turn, giving the developer no opportunity to provide
informed answers per question. The sentinel enforces a strict one-question-per-turn discipline.

Research detours (Exa, Context7, code-vectorizer) are handled inline during the verdict wait,
not as a separate phase. When the developer requests research instead of providing a verdict,
the agent performs the lookup, presents findings, and re-presents `WAITING_FOR_VERDICT`. This
keeps the session state machine simple: the only terminal event for a question is a valid
verdict string.

### Answer persistence is incremental

After each confirmed verdict, the agent writes the answer to the `- **Answer:**` field and
increments `answered_count` in the frontmatter before presenting the next question. This makes
the session resumable: if interrupted, the agent reads the current `answered_count`, skips
already-answered questions, and continues from where it left off. No separate session state
file is required.

### Traceability link in audit-derived plans

Audit-derived `plan.md` files replace the standard `**Spec**: [spec.md](spec.md)` header link
with `**Source**: [questions.md](questions.md)`. This ensures any reader of a `plan.md` can
trace it back to its origin without ambiguity. The downstream `tasks` and `implement` skills
are unaffected because they do not read the plan header link.

### No new misfit categories

The existing SDD misfit taxonomy is sufficient to classify audit findings. Each actionable
question answer (`bug` or `approved improvement`) maps directly to a WP candidate in `plan.md`.
The `deferred` verdict maps to the plan's Open Questions section. `intended behavior` and
`out-of-scope` are excluded from the plan entirely.

---

## Consequences

### Positive

- Existing codebase audits now produce a structured, tool-validated artefact chain
  (`questions.md` -> `plan.md` -> tasks -> work packages) rather than ad-hoc review documents.
- The audit workflow is an on-ramp into the standard SDD pipeline: once `plan.md` exists, all
  downstream skills (`tasks`, `implement`, `review`, `accept`, `merge`) work without modification.
- Import mode allows teams to migrate existing review documents into the canonical format
  incrementally.
- `questions.yaml` schema gives the tool a stable validation target for `questions.md`
  frontmatter; adding new frontmatter fields follows the established schema-first rule (ADR-004).

### Negative

- Two new CLI subcommands increase the surface area of `spec-bridge-skill-tool`. Future
  contributors must understand when to use `audit` vs `audit-fix` vs `specify`.
- The interactive resolution session in `audit-fix` depends on the agent correctly maintaining
  `answered_count` in frontmatter after each answer. If the agent skips the increment, the
  session appears complete before it is. The tool detects this only at the final `audit-fix`
  validation call, not mid-session.
- Audit-derived `plan.md` files lack a `spec.md` reference. If any downstream tooling assumes
  `spec.md` exists when `plan.md` does, it will need to be updated.

### Mitigation

The `answered_count` drift risk is mitigated by the post-answer checklist in the `audit-fix`
adapter template, which explicitly requires the agent to re-read the frontmatter after each
write to verify the count before presenting the next question. If drift is observed in practice,
a `spec-bridge-skill-tool count-answers` subcommand can be introduced to compute the count from
body content and reconcile it with the frontmatter field.

---

## References

- Feature spec: `specs/044-audit-and-audit-fix-workflows/spec.md`
- Plan: `specs/044-audit-and-audit-fix-workflows/plan.md`
- Questions schema: `skill-tool/src/skill_tool/init_cmd/schemas/v1/questions.yaml`
- Audit skill: `skill-tool/src/skill_tool/skills/audit/skill.py`
- Audit-fix skill: `skill-tool/src/skill_tool/skills/audit_fix/skill.py`
- Audit adapter template: `skill-tool/src/skill_tool/adapters/templates/audit.md`
- Audit-fix adapter template: `skill-tool/src/skill_tool/adapters/templates/audit-fix.md`
- ADR-002: `0002-two-responsibility-model.md`
- ADR-003: `0003-skill-module-isolation.md`
- ADR-004: `0004-schema-first-artifact-design.md`
- ADR-007: `0007-adapter-pattern-for-agent-specific-file-generation.md`
