# Research: Review Skill Missing Language-Level Quality Gate

**Date**: 2026-05-20
**Source**: Observed during a live `spec-bridge review` session on feature
`012-markdown-editor-architecture-for-monaco` (deepagent project),
Work Package WP02 (MarkdownPreviewPane).
**Purpose**: Document a reproducible gap in the `review` skill where language-level
build failures (TypeScript errors, Python lint) are not checked by any standard
criterion, allowing code with compilation errors to be moved to `lane: for_review`
and potentially approved without the reviewer noticing.

---

## 1. Executive Summary

The `review` skill's `generate-review-template` command produces a checklist with
four standard SyDD criteria (Misfit Resolution, Subsystem Boundary, Contract
Compliance, No New Misfits). None of these requires the reviewer to verify that
the implementation compiles, passes static analysis, or keeps existing tests green.
The `spec-bridge-skill-tool review` validation (Step Validate) checks seven
post-review invariants — all structural — and also ignores compilation.

In the WP02 session, two TypeScript errors were present throughout the entire
`implement` phase and were only discovered when the reviewer ran `tsc --noEmit`
manually. The errors would have been approved invisibly if the reviewer had not
added this step outside the skill's instruction set.

Both gaps are in the **skill instruction set** (SKILL.md) and the
**`generate-review-template` tool command output**, not in the core validation
logic. The two-responsibility model (ADR-0002) is not violated: adding a language
quality gate is outcome verification, not orchestration.

---

## 2. Observed Evidence

### Session: deepagent feature 012, WP02 review, 2026-05-20

After WP02 was submitted for review (`lane: for_review`), the reviewing agent
ran `npx tsc --noEmit` in the worktree as part of a manual inspection step and
found two errors:

**Error 1** — `MarkdownPreviewPane.tsx:200,201`

```
error TS4104: The type 'readonly [(options?: Options) => undefined]'
is 'readonly' and cannot be assigned to the mutable type 'Pluggable[]'.
```

**Root cause**: `REHYPE_PLUGINS` and `REMARK_PLUGINS` were declared with
`as const`, producing `readonly` tuples. `ReactMarkdown` expects the mutable
`PluggableList` type. Fix: annotate as `PluggableList` from `unified` and
remove `as const`.

**Error 2** — `registerEditorPanes.ts:46,47`

```
error TS2322: Type '<Services extends BrandedService[]>(typeId: string, name:
string, ctor: ...) => IDisposable' is not assignable to type
'(...args: unknown[]) => unknown'.
  Types of parameters 'typeId' and 'args' are incompatible.
    Type 'unknown' is not assignable to type 'string'.
```

**Root cause**: The `RegisterEditorPanesDeps` interface declared both functions
as `(...args: unknown[]) => unknown`. TypeScript's contravariant parameter
checking rejects the assignment of the real `_registerEditorPane` function
(which requires `string` first param) to the `unknown`-typed rest signature.

### What happened during the review

1. The implementing agent ran all 18 unit tests — they passed.
2. The implementing agent wrote an Implementation Summary stating the work was
   complete.
3. `spec-bridge-skill-tool implement` validation returned `status: ok` (7/7
   checks passed).
4. The WP was moved to `lane: for_review`.
5. The reviewing agent ran `tsc --noEmit` as a non-prescribed step and found
   the two errors.
6. The `generate-review-template` checklist had no criterion prompting this check.

Had the reviewing agent followed only the prescribed skill steps, both TypeScript
errors would have been invisible and the WP would have been approved.

---

## 3. Root Cause Analysis

### 3.1 `generate-review-template` omits build health

The four standard criteria in the review template are entirely behavioral:

| # | Criterion | What it checks |
|---|-----------|----------------|
| 1 | Misfit Resolution | Each misfit in `misfits_addressed` has a passing test |
| 2 | Subsystem Boundary Respect | No undeclared cross-subsystem coupling |
| 3 | Contract Compliance | Implementation matches plan.md contracts |
| 4 | No New Misfits | No new undocumented failure modes |

None of these checks **"does the code compile?"** or **"do the type annotations
hold?"**. A reviewer following only these four criteria would not run `tsc`,
`mypy`, or `pyright`.

### 3.2 `implement` skill validation has no build check

The `spec-bridge-skill-tool implement` post-condition validation checks:

| Check | What it verifies |
|-------|-----------------|
| `wp_history_doing` | History has a `doing` entry |
| `wp_tdd_red_clean` | `tdd_red_clean: true` in frontmatter |
| `worktree_exists` | Git worktree was created |
| `implement_summary_complete` | Implementation summary was written |

It checks for the presence and completeness of artifacts, but not for build
health. The implementing agent can pass all four checks with a codebase that
does not compile.

### 3.3 The SKILL.md instruction gap

`spec-bridge-implement/SKILL.md` Step 8 (Validate) says:

> Run: `spec-bridge-skill-tool implement --feature ... WP_ID`
> - `status: ok` → report success.
> - `status: error` → halt, fix the issue.

There is no instruction step between "implement" and "validate" that says:
**"Run the language type-checker and ensure exit 0 before calling validate."**

`spec-bridge-review/SKILL.md` Step 4 (Review the implementation) says to inspect
the worktree, but gives no explicit instruction to check compilation.

### 3.4 The pattern generalises

The same gap applies to Python WPs:
- A `deepagent` Python WP that introduces `mypy`/`pyright` errors would also
  pass `spec-bridge-skill-tool implement` and potentially be approved under
  the four standard review criteria.
- Similarly, a WP that silently breaks existing tests in unrelated files would
  not be caught unless the reviewer ran the full test suite.

---

## 4. Impact Assessment

| Risk | Likelihood | Severity | Notes |
|------|------------|----------|-------|
| TypeScript/Python build errors approved | High | High | No prescribed check; only caught by reviewer initiative |
| Test regressions missed | Medium | High | Implement validation checks `tdd_red_clean` but not full test suite pass |
| Type-level contract violations approved | High | Medium | Contract compliance criterion is semantic; TypeScript type errors are structural |
| Agent authors unaware of gap | High | Medium | Agents follow the SKILL.md; if it doesn't say "run tsc", many won't |

**Observed frequency**: 2 TypeScript errors in 1 WP review session, 0 automatic
detection.

---

## 5. Proposed Improvements

Three changes, each independently valuable, ordered by impact-to-effort ratio.

---

### Improvement A: Add a 5th standard criterion to `generate-review-template`

**Impact**: High. Every future review will include a build health verdict cell
that the reviewing agent must fill.

**Change**: In
`skill-tool/src/skill_tool/skills/review/skill.py` (or the module that
generates the review template), add a fifth standard criterion:

```python
{
    "name": "Build passes: language type-checker exits 0 (tsc --noEmit, mypy --strict, pyright, or equivalent)",
    "verdict": "",
    "note": ""
}
```

**How a reviewer satisfies it**:

```bash
# TypeScript WP (run from worktree root)
npx tsc --noEmit
# Expected: exit 0, no output

# Python WP (run from worktree root)
uv run pyright deepagent/   # or mypy --strict src/
# Expected: exit 0
```

The reviewer sets `verdict: pass` only when exit 0 is confirmed. If errors
are found, `verdict: fail` triggers a change request with the compiler output
in the issue description.

**Why it fits ADR-0002**: This is outcome verification — checking that the
implementation's code health meets the project's quality contract. The tool
itself does not run the compiler; it only checks that the reviewer recorded
the outcome.

---

### Improvement B: Add a `build_validated` field to the WP frontmatter schema

**Impact**: Medium. Creates a traceable record of who validated the build and
when, queryable across all WPs.

**Change**: Add to `skill-tool/src/skill_tool/init_cmd/schemas/v1/work_package.yaml`:

```yaml
build_validated:
  type: boolean
  required: false
  description: >
    Set to true by the implementing agent after running the language
    type-checker (tsc --noEmit, pyright, mypy --strict) and confirming
    exit 0. The review skill verifies this field before rendering a verdict.
```

**Change to `implement` SKILL.md**: Add a step before calling
`spec-bridge-skill-tool implement`:

```bash
# Intent: verify build health before submitting for review.
# A non-zero exit means the WP contains type or compilation errors
# that must be fixed before the review skill can proceed.
npx tsc --noEmit   # or equivalent for the language
# On exit 0: set build_validated: true in WP frontmatter
# On non-zero: stop, fix the errors, then re-run
```

**Change to `review` SKILL.md**: The reviewer checks `build_validated: true`
before accepting the WP into review.

**Change to `spec-bridge-skill-tool implement` validation**: Add check
`build_validated_true` to `SkillOutputContract`:

```python
CheckResult(
    name="build_validated_true",
    passed=wp.get("build_validated") is True,
    reason="build_validated must be true (run tsc --noEmit or equivalent before submitting)",
    ...
)
```

---

### Improvement C: Add a language-type check step to the SKILL.md instruction sets

**Impact**: Medium. Lowest effort — no tool changes, only SKILL.md text changes.
Immediately deployable to all projects using the skill.

**Change to `spec-bridge-implement` SKILL.md** (after T005 "Write tests green"):

```markdown
### Step N — Language-level quality gate

Run the type-checker for the affected language before calling `implement`:

| Language | Command | Expected |
|----------|---------|----------|
| TypeScript | `npx tsc --noEmit` in the worktree root | Exit 0, no output |
| Python | `uv run pyright <package>/` or `uv run mypy --strict <package>/` | Exit 0, no errors for new files |

If the type-checker exits non-zero:
1. Fix all errors before proceeding.
2. Do NOT use `// @ts-ignore`, `# type: ignore`, or cast suppressions unless
   you have documented why the checker is objectively wrong.
3. Re-run until exit 0.

Only proceed to the Validate step when the type-checker exits 0.
```

**Change to `spec-bridge-review` SKILL.md** (add to Step 4 Review checklist):

```markdown
#### Build health (add to standard inspection)

Before rendering any verdict:

```bash
# Run from the WP worktree directory
npx tsc --noEmit   # TypeScript projects
uv run pyright <package_dir>/   # Python projects
```

If exit non-zero: record the errors as Issue N with severity `critical` and
verdict `fail` for the "Build passes" criterion. Do not approve a WP with
compilation errors.
```

---

## 6. Recommendation

Implement all three improvements in order:

1. **Start with Improvement C** (SKILL.md text only) — zero code changes,
   deployable immediately by editing the adapter templates. Closes the gap for
   all agents using the skills from the next `spec-bridge-skill-tool init`.

2. **Follow with Improvement A** (5th criterion in template) — one tool code
   change. Makes build health a first-class, trackable verdict in every review
   summary JSON sidecar.

3. **Defer Improvement B** (frontmatter schema change) until A is validated in
   production. Schema changes require updating all existing WP files and the
   schema version. The benefit (machine-readable `build_validated` field) is
   smaller than A+C combined.

**Proposed spec for the spec-bridge improvement feature**:

```
Feature: review-build-health-gate
Goal: ensure that language-level compilation/type-checking is a mandatory
      step in both the implement and review skills.
WPs:
  WP01 (contracts-only): update review template + implement SKILL.md
  WP02 (schema): add build_validated to WP schema + implement validation check
```

---

## 7. Secondary Gap: YAML Frontmatter Corruption on `append-*-summary`

Observed in the same WP02 session. Secondary but worth tracking.

### Symptom

When `spec-bridge-skill-tool append-implement-summary` and
`append-review-summary` are called, they rewrite the WP YAML frontmatter. The
rewrite:

1. Strips YAML quotes from values (e.g. `lane: "for_review"` becomes
   `lane: for_review`).
2. Does NOT preserve history entries that were added externally between the last
   `append-*` call and the current one.

This caused the `history_has_for_review` and `history_last_lane_reviewed`
validation checks to fail because the YAML history list contained only the
initial `doing` entry after the implement summary was appended.

### Impact

The `spec-bridge-skill-tool review` step was marked `status: error` until the
history was manually repaired. This is a data-loss risk: any history mutations
made between `append-implement-summary` and the next `append-*` call are silently
dropped.

### Proposed fix

`append-implement-summary` and `append-review-summary` should:

1. **Read the current frontmatter before writing** and merge the new fields
   into the existing YAML rather than overwriting the entire frontmatter block.
2. Specifically, treat `history` as an **append-only list**: only push new
   entries, never replace the list.
3. Preserve quote style for known enum fields (`lane`, `review_status`) to
   avoid breaking downstream regex-based updates.

---

## 8. Related Files

| File | Relevance |
|------|-----------|
| `skill-tool/src/skill_tool/skills/review/skill.py` | Generates the review template; add 5th criterion here |
| `skill-tool/src/skill_tool/adapters/templates/review.md` (or equivalent) | SKILL.md source — add language quality gate step |
| `skill-tool/src/skill_tool/adapters/templates/implement.md` | SKILL.md source — add build gate before validate step |
| `skill-tool/src/skill_tool/init_cmd/schemas/v1/work_package.yaml` | Schema — add `build_validated` field (Improvement B) |
| `skill-tool/src/skill_tool/skills/implement/skill.py` | `SkillOutputContract` — add `build_validated_true` check (Improvement B) |
| `docs/adr/0002-two-responsibility-model.md` | Confirms that language quality checks are outcome verification, not orchestration |

---

## 9. Appendix: Minimal Reproducer

To reproduce the gap against any spec-bridge feature:

1. Implement a TypeScript WP introducing a type error (e.g. `const x: string = 42;`).
2. Run all unit tests — they will likely still pass.
3. Write an implementation summary and call `spec-bridge-skill-tool implement`.
4. Observe: `status: ok` — the validation passes despite the type error.
5. Move to `lane: for_review`.
6. Call `spec-bridge-skill-tool generate-review-template`.
7. Observe: the template has 4 criteria, none mentioning TypeScript.
8. Fill all 4 as `pass` and call `spec-bridge-skill-tool append-review-summary`.
9. Observe: `status: approved` — the review passes despite the type error.

The type error is only caught if the reviewer explicitly runs `tsc --noEmit`
outside the prescribed skill workflow.
