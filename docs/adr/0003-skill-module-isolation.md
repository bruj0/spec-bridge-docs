# ADR 0003: Skill Module Isolation: No Cross-Skill Imports

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

`spec-bridge-skill-tool` contains one module per SDD workflow skill: `specify`, `plan`, `tasks`,
`implement`, `review`, `accept`, `merge`. As the number of skills grows and skills evolve
independently, there is a risk that skill modules begin to reference each other -- sharing
validation helpers, outcome contract fragments, or artifact path logic across skill boundaries.

Cross-skill dependencies create an invisible coupling graph. Changing one skill's internal
representation can silently break another. Testing becomes harder because a skill's test suite
must account for transitive imports from other skills. Deleting or refactoring a skill cascades
across the whole codebase.

Options considered:

1. **No isolation rule**: Skills can import from each other freely.
2. **Soft guideline**: Prefer isolation; cross-skill imports are allowed if justified.
3. **Hard isolation**: Each skill module may only import from `skill_tool.core`. Cross-skill
   imports are a constitution violation and must be caught at code review.
4. **Plugin architecture**: Skills are loaded dynamically as plugins; no static imports at all.

---

## Decision

**Option 3**: Hard isolation, constitutionally enforced.

Each skill module lives in `skill_tool/skills/<skill>/`. The module may import from:
- `skill_tool.core` -- shared infrastructure only
- Standard library and declared third-party dependencies

The module must NOT import from any other `skill_tool.skills.<other_skill>` module.

All cross-skill shared logic belongs in `skill_tool.core`. If logic appears in two skill modules,
it is moved to core -- not referenced across skill boundaries.

Co-location rule: all artifact generation logic, schema loading, validation logic, and the
artifact template for a skill are placed within that skill's directory (`skills/<skill>/`).

---

## Rationale

### Predictable change surface

When a skill module is self-contained, the impact of a change is bounded to that module and its
tests. Engineers can read a skill's directory and understand everything the skill does without
tracing imports across the codebase.

### Deletability as a correctness property

The requirement "deleting a skill module must not break any other skill at runtime" is a
concrete, testable property. It means every skill is an independently deployable unit of
validation logic. This property is only achievable with hard isolation.

### Testability

Isolated skill modules can be tested in complete isolation: a test file in `skills/<skill>/tests/`
only needs to mock `skill_tool.core` interfaces. No other skill's code is in the execution path.

### Co-location reduces cognitive load

Placing the artifact template, schema reference, outcome contract, and tests in one directory
means a developer working on a skill never needs to leave that directory to understand the full
picture.

### Options 1 and 2 rejected

Unconstrained or soft-guideline cross-skill imports accumulate gradually. By the time the
coupling is painful, it is expensive to untangle. A constitutional rule makes the enforcement
cost zero (it is checked at PR time) rather than paying a large refactoring cost later.

### Option 4 considered

A plugin architecture would solve isolation at the import level, but adds runtime complexity
(discovery, registration, error propagation) that is not needed for a small, known set of skills.
Option 3 achieves the same isolation property with zero runtime overhead.

---

## Consequences

### Positive

- Any skill module can be deleted without breaking other skills
- Skill test suites are fully isolated: no transitive mock complexity
- Adding a new skill is a purely additive change: create a new directory, no existing code touched
- Code review can verify isolation mechanically (grep for cross-skill imports)

### Negative

- Logic that naturally belongs at a "skill group" level must be placed in core, even if only
  two skills use it -- there is no middle layer
- Developers must resist the temptation to "just import from the tasks skill" when implement
  needs a shared path utility

### Mitigation

`skill_tool.core` is the sanctioned home for any cross-skill utility. The rule is simple:
if it is needed by more than one skill, it lives in core. The code review checklist enforces
this at the boundary.

---

## References

- Constitution: `.spec-bridge/memory/constitution.md` - Architecture section, Skill Module Isolation
- ADR-002: `0002-two-responsibility-model.md`
- Feature spec: `specs/043-modular-skill-aligned-cli-refactor/spec.md`
