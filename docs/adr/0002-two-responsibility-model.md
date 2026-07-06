# ADR 0002: Two-Responsibility Model: Schema Validation and Outcome Verification Only

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

`spec-bridge-skill-tool` is invoked by AI agents at the end of each skill workflow step. Without
a strict boundary on what the tool does, there is a natural pull to add convenience features:
auto-fixing frontmatter, generating missing artifacts, orchestrating multi-step workflows,
providing richer developer UX, and so on.

Every additional responsibility increases the surface area for bugs, makes the tool harder to
test, and blurs the line between "AI agent's job" and "harness's job". A validation harness
that generates or modifies files is no longer a deterministic validator -- it becomes an
opinionated orchestrator, which defeats the purpose of having AI agents follow skill instruction
sets.

Options considered:

1. **Single responsibility**: Schema validation only (no outcome verification).
2. **Two responsibilities**: Schema validation (pre-condition) + outcome verification (post-condition).
3. **Full orchestration**: The tool drives the workflow, calls the AI agent, then validates.
4. **Open-ended**: No formal constraint on responsibilities; add features as needed.

---

## Decision

**Option 2**: Exactly two responsibilities, constitutionally enforced.

**Responsibility 1 -- Schema Validation (pre-condition):**
Before any workflow proceeds, load versioned schema YAML files, derive Pydantic models, and
validate the YAML frontmatter of every artifact produced or consumed by the skill. Any violation
causes a structured error and non-zero exit immediately.

**Responsibility 2 -- Outcome Verification (post-condition):**
After the AI agent completes its skill workflow and calls `spec-bridge-skill-tool <skill>`,
verify that the skill achieved its declared goal: expected artifacts exist on disk, required
frontmatter fields are populated and non-trivial, and skill-specific completeness rules pass.

No other responsibilities are permitted without a constitutional amendment and a new ADR.

---

## Rationale

### Why two, not one

Schema validation without outcome verification catches structural violations but not behavioral
failures -- an artifact can have valid frontmatter yet still be an empty stub. Outcome
verification closes this gap by checking completeness rules.

### Why two, not more

Adding orchestration (Option 3) or workflow logic to the tool means the tool modifies disk state.
A tool that both validates and generates is harder to trust: does it fail because the agent did
something wrong, or because the tool itself made an incorrect modification?

Keeping the tool read-only (except for the `init` command, which is a one-time setup) makes
failures unambiguous: if the tool exits non-zero, the agent's output is the problem.

### Constitutional enforcement

Because this boundary is so easy to erode, the two-responsibility rule is encoded in the
constitution (`governance` section), not just in a README. Violations are caught at code review
using the constitution checklist.

### Options 1 and 4 rejected

Option 1 (schema only) leaves outcome verification to the agent, which makes skill contracts
vague. Option 4 (no constraint) inevitably leads to a bloated tool that is hard to test and
reason about. Both were rejected in favor of a tight, explicit contract.

---

## Consequences

### Positive

- The tool is fully read-only after `init`, making failures unambiguous
- Scope is small enough that 90%+ test coverage is achievable and sustainable
- AI agents bear full responsibility for artifact content; the tool only certifies correctness
- Adding a new skill requires only a new module and contract -- the core tool remains unchanged
- Easy to reason about: if the tool exits 0, the skill's artifacts are structurally correct and
  outcome-complete

### Negative

- Convenience features (auto-fix, partial retry, enrichment) are out of scope by design
- Developers who want richer feedback must add it to the skill instruction set, not the tool
- The boundary requires ongoing discipline to maintain as the project grows

### Mitigation

The constitution amendment process (ADR + PR + review) creates a deliberate gate for any
proposed expansion of the tool's responsibilities.

---

## References

- Constitution: `.spec-bridge/memory/constitution.md` - Architecture section, Two-Responsibility Model
- ADR-001: `0001-spec-bridge-skill-tool-as-separate-binary.md`
- ADR-003: `0003-skill-module-isolation.md`
- Feature spec: `specs/043-modular-skill-aligned-cli-refactor/spec.md`
