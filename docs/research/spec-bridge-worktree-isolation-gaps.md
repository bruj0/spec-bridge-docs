# Spec-Bridge Skills: Worktree Isolation Gap Report

**Date:** 2026-05-24  
**Trigger:** Feature `019-skills-discovery-invocation` — product code and merges landed on `main` during implement/review, before `spec-bridge-accept` and `spec-bridge-merge`.  
**Goal:** Document what to change in SyDD skills (and optional tooling) so **all implementation, validation, and manual testing happen in WP worktrees**, and **`main` is touched only by `spec-bridge-merge` after `spec-bridge-accept`**.

---

## Executive summary

The skills **describe** worktree isolation correctly in places (`spec-bridge-implement` Steps 5–7, `spec-bridge-review` Step 4c), but they **do not enforce** it. Agents routinely:

1. Run tests and dev servers from the **planning root** (`main`) because paths are familiar and `lane: done` is confused with “shipped to `main`”.
2. **Merge WP branches into `main` during implement** when integration testing “needs everything on main”.
3. Add **ad-hoc “merge-land” WPs** (e.g. WP06) that duplicate `spec-bridge-merge`.
4. Commit **task/planning artifacts** from `main` while **product code** is split between worktrees and `main`.

**Fix strategy:** Add hard guards, explicit test/dev commands scoped to `$WORKTREES_DIR`, a single merge entrypoint, and optional `spec-bridge-skill-tool` checks — not more prose alone.

---

## Intended model (canonical)

| Phase | Git location | Allowed git operations on `main` |
|--------|----------------|-----------------------------------|
| specify → tasks | Planning root | Task/spec commits only |
| **implement** | `.worktrees/<feature>-<WP>/` | **None** (no merge to `main`, no product commits on `main`) |
| **review** | Inspect via `git -C worktree`; typecheck/tests **in worktree** | Task lane commits on planning root only |
| **accept** | Planning root | Readiness checks; no product merge |
| **merge** | Planning root on `$TARGET_BRANCH` | **Only** skill that merges WP branches → `main` |

**Dependency integration:** `git merge --no-ff <feature>-<dep>` runs **inside the current WP worktree**, never `git checkout main && git merge`.

**Integration testing before merge:** Either run tests in the **last WP worktree** after merging all dependency branches into it, or use a **temporary integration worktree** — not `main`.

---

## Case study: what went wrong on 019

| Event | Symptom | Root cause |
|--------|---------|------------|
| Early harness WIP | `22f64bbb` on `main` | Work started on planning root before WP01 worktree discipline |
| WP02 / WP03 | Commits on `main` “so IDE/bridge can test” | Agent treated `main` as integration branch |
| WP04–WP05 | Linear product commits on `main` | Implement effectively on `main`; worktrees stale or unused for edits |
| WP06 merge-land | `3ca4c97e` merges WP04–05 during **implement** | Ad-hoc WP duplicated **merge**; review only audited, did not block |
| Review “approved” | User told “landed on main” | **Lane `done` ≠ merged to `main`**; skill never required “code only on WP branch” |

Transcript pattern (paraphrased): *“approved in worktree but not on main — merge so we can run the app from main.”* That contradicts the skill contract.

---

## Gap analysis by skill

### 1. `spec-bridge-implement` — highest priority

**What exists today**

- “Working directory isolation” section (Steps 1–4 planning root, 5–7 worktree).
- Step 6: dependency merges **inside worktree**.
- Step 7b: type-check “Run from inside the worktree” but **no `cd` block** in the snippet (unlike review Step 4c).

**Gaps**

| ID | Gap | Risk |
|----|-----|------|
| I1 | No **forbidden commands** list (`git checkout main`, `git merge … main`, `git push origin main` for product) | Agents merge to `main` during implement |
| I2 | `<project-test-command>` placeholders with **no rule** “must run with `pwd` = worktree” | Tests run on `main` checkout |
| I3 | No guidance for **IDE / bridge / extension** dev (`npm run dev`, VS Code F5) from worktree path | “Open repo from main” default |
| I4 | Steps 7b, 8, 9: `cd <planning-repo-root>` for task frontmatter — easy to **stay on main** and edit product files | Slippage after worktree |
| I5 | `tdd_red_clean` / `build_validated` committed from planning root — **no check** that product diff is empty on `main` | False green on wrong tree |
| I6 | No **pre-flight**: `git -C worktree branch` must equal `$FEATURE_SLUG-$WP_ID` before first edit | Wrong directory |
| I7 | No ban on **ad-hoc merge-land WPs**; WP06-style tasks encouraged “merge to main” in implement | Bypasses accept + merge |

**Recommended skill edits**

1. Add section **“Hard rules (implement)”**:
   - NEVER `git checkout $TARGET_BRANCH` for product work during this skill.
   - NEVER `git merge $FEATURE_SLUG-*` into `$TARGET_BRANCH`.
   - ALL product file paths in commits must appear in `git -C $WORKTREE diff $TARGET_BRANCH...HEAD --name-only`.
2. Add **Step 5a — Worktree sentinel** (run after `cd` worktree):

   ```bash
   WORKTREE="$WORKTREES_DIR/$FEATURE_SLUG-$WP_ID"
   test "$(git -C "$WORKTREE" rev-parse --show-toplevel)" = "$(git -C "$WORKTREE" rev-parse --git-dir | sed 's|/.git/worktrees/.*||')" || true
   BR=$(git -C "$WORKTREE" branch --show-current)
   test "$BR" = "$FEATURE_SLUG-$WP_ID" || { echo "ERROR: not on WP branch"; exit 1; }
   # Product must not be committed on main:
   git diff --name-only $TARGET_BRANCH -- ':!specs/' ':!.cursor/' ':!CHANGELOG.md' | grep -q . && \
     echo "WARN: main has product diff; stop and use worktree only" && exit 1
   ```

3. Replace generic test placeholder with:

   ```bash
   cd "$WORKTREES_DIR/$FEATURE_SLUG-$WP_ID"
   # record: pwd must be worktree in implement summary test_results.command
   <project-test-command>
   ```

4. Add **“Running the app from a worktree”** subsection: set `cwd` to worktree for CLI; for VS Code, open folder `$WORKTREE` or use multi-root; document `DEEPAGENT_*` / bridge base URL if env-specific.

5. **Forbidden WP types:** If a task title/description contains “merge to main”, “land on main”, “integrate to main” — STOP and tell user to run `spec-bridge-merge` after accept, not implement.

---

### 2. `spec-bridge-review` — high priority

**What exists today**

- Step 4: `git -C $WORKTREES_DIR/...` log/diff.
- Step 4c: explicit `cd` worktree for type-check.
- SyDD checklist: “test exists and passes” — **no command** saying where to run tests.

**Gaps**

| ID | Gap | Risk |
|----|-----|------|
| R1 | **No mandatory test run in worktree** before approve | Reviewer validates “green” from agent memory or `main` |
| R2 | No check that **WP branch tip** contains product commits not on `main` yet | Approving work that only exists on `main` |
| R3 | Step 5a “done” does not require `git merge-base --is-ancestor $WP_BRANCH $TARGET` **false** for product | Confuses lane with merge |
| R4 | Review can pass when worktree is **missing** or **stale** vs `main` | WP06-style audit-only review |

**Recommended skill edits**

1. Add **Step 4c2 — Test gate (required)**:

   ```bash
   cd "$WORKTREES_DIR/$FEATURE_SLUG-$WP_ID"
   <project-test-command>   # must match implement summary command
   ```

   Fail approve if exit non-zero.

2. Add **Step 4c3 — Branch isolation check**:

   ```bash
   # Product commits on WP branch not merged to target:
   git -C "$WORKTREE" log $TARGET_BRANCH..HEAD --oneline -- ':!specs/'
   # If empty AND main has feature files not in WP branch → FAIL (implemented on main)
   ```

3. In **Step 5a**, add explicit note: **`lane: done` does not merge to `main`**. Merge is only `spec-bridge-merge`.

4. If worktree directory missing: **request changes**, do not approve from `main` diff alone.

---

### 3. `spec-bridge-merge` — medium (clarify, don’t weaken)

**What exists today**

- Strong guard: must be on `$TARGET` from **main repo root**, not inside worktree (Step 3c).
- Post-merge integration tests on target branch — correct **only here**.

**Gaps**

| ID | Gap | Risk |
|----|-----|------|
| M1 | No prerequisite: **`spec-bridge-accept` passed** | Merge before acceptance |
| M2 | No detection “target already contains WP commits” vs silent skip | False confidence after partial early merges |
| M3 | `ls src/` sanity check is project-specific | deepagent may use other roots |

**Recommended skill edits**

1. Prerequisite bullet: `spec.md` lane `planned_accepted` (or accept skill completed).
2. Before each WP merge, log:

   ```bash
   git log -1 --oneline $FEATURE_SLUG-$WP_ID
   git merge --no-ff ...  # existing
   ```

3. If `git merge` reports “Already up to date” **and** `git log $TARGET..$FEATURE_SLUG-$WP_ID` is empty **but** files exist on target from an earlier rogue merge — emit **WARNING** in review/merge summary (document in CHANGELOG).

---

### 4. `spec-bridge-accept` — medium

**What exists today**

- “Main repository root (not inside a worktree)” — good for accept metadata.

**Gaps**

| ID | Gap | Risk |
|----|-----|------|
| A1 | Does not verify **each WP branch exists** and has product commits | Accept with hollow WPs |
| A2 | Does not assert **no required product commit only on `main`** | Accept after 019-style leakage |

**Recommended:** Add accept checklist item: “For each WP in `done`, worktree branch `$FEATURE-$WP` is ahead of `$TARGET_BRANCH` for at least one non-spec path OR merge skill will no-op with documented warning.”

---

### 5. `spec-bridge-execute` — medium

**Gaps**

| ID | Gap | Risk |
|----|-----|------|
| E1 | Orchestrates implement → review but **never states** “executor must not work on `main`” | Long runs amplify leakage |
| E2 | Crash recovery: “inspect worktree” — no “do not continue on main” | Recovery on wrong tree |

**Recommended:** One paragraph at top: **Executor agents must pass worktree path to subprocess skills; never open planning root for product edits.**

---

### 6. `spec-bridge-fast-iterate` — medium

**Gaps**

| ID | Gap | Risk |
|----|-----|------|
| F1 | Combines specify/plan/tasks then implement — still subject to I* gaps | Same leakage, faster |
| F2 | Documents merge after review — good — but **no stronger isolation** than implement | |

**Recommended:** Mirror all **implement** hard rules; single WP still uses one worktree.

---

### 7. Planning skills (specify, plan, tasks, decompose) — low

Generally safe (artifacts under `specs/`). **Exception:** WPs must not be authored with instructions like “merge branches to main” or “verify on main” — use “verify in WP worktree after dependency merge”.

**tasks skill:** Add template line under each WP:

```markdown
## Execution constraints
- Product code and tests: only in `.worktrees/<feature>-<WP>/`
- Do not merge to `main` until `spec-bridge-merge` after accept
```

---

## Tooling gaps (`spec-bridge-skill-tool`)

Skills can be ignored; **automated gates** reduce recurrence.

| Check | When | Behavior |
|--------|------|----------|
| `implement` validate | Step 9 | Fail if `git diff $TARGET_BRANCH --name-only` on planning root includes paths outside allowlist (`specs/`, `.gitignore`, task chore) |
| `implement` validate | Step 9 | Require `test_results.command` contains worktree path or `cwd` proof |
| `review` validate | Step 5 | Fail approve if worktree missing |
| `review` validate | Step 5 | Optional: require `test_results` sidecar from worktree run |
| `merge` | Start | Fail if accept lane not satisfied |
| New: `wp-branch-ahead` | CI / manual | Lists product files on WP not on target |

**Source of truth:** Implement validators in `spec-bridge-v2/skill-tool/` and redeploy skills via `spec-bridge-skill-tool init` (per spec-bridge-v2 AGENTS.md — edit **adapter templates**, not `.cursor/skills/` only).

---

## Anti-patterns to ban (explicit in all execution skills)

1. **“Merge to main so I can test”** — use worktree + dependency merges instead.
2. **`lane: done` means on main** — lane is workflow state only.
3. **Review without running tests in worktree** — not a valid review.
4. **WP06-style “merge-land” in implement** — merge is one skill, one time, after accept.
5. **Stash/pop on main to “bring WP work over”** — conflicts with worktree model; use branch merge inside worktree.
6. **Committing product code from planning root** — even if tests passed there.

---

## Testing and dev workflow (deepagent-specific)

| Activity | Correct location |
|----------|------------------|
| `make test` / `uv run pytest` | `$WORKTREES_DIR/<feature>-<WP>/` |
| `npm run dev` (IDE) | `apps/ide` from worktree; bridge/env points at worktree root |
| VS Code extension host | Open `$WORKTREE` or launch config `cwd` |
| Task frontmatter / `spec-bridge-skill-tool` | Planning root |
| Final integration test | `spec-bridge-merge` Step 3e on `$TARGET_BRANCH` only |

Document in **implement** skill: monorepo may need `uv sync` / `npm install` **inside worktree** (separate `node_modules` is OK; do not “test from main node_modules” for WP code).

---

## Prioritized remediation backlog

| Priority | Item | Owner |
|----------|------|--------|
| P0 | Implement: hard rules + worktree sentinel + test `cd` | `spec-bridge-implement/SKILL.md` |
| P0 | Review: mandatory worktree tests + isolation check | `spec-bridge-review/SKILL.md` |
| P0 | Ban merge-land WPs in implement + tasks template | implement + tasks skills |
| P1 | Merge: accept prerequisite + already-on-main warning | merge + accept skills |
| P1 | Execute / fast-iterate: isolation preamble | execute, fast-iterate |
| P2 | `spec-bridge-skill-tool` validate hooks | spec-bridge-v2 skill-tool |
| P2 | Sync templates → deepagent `.cursor/skills` via init | process |
| P3 | Agent rule in `AGENTS.md` / constitution | `.spec-bridge/memory/constitution.md` |

---

## Sync note (two skill trees)

DeepAgent carries skills at:

- `deepagent/.cursor/skills/spec-bridge-*/SKILL.md`

Spec-bridge-v2 source of truth for deployed copies:

- `skill-tool/src/skill_tool/adapters/templates/` (flat or directory)

After editing templates, run `spec-bridge-skill-tool init` in each consumer repo so agents do not read stale deployed skills.

---

## Success criteria

For a new feature `0NN-*`:

1. `git log main --oneline` during implement/review shows **only** `chore(tasks):` / spec commits — no product feature commits until merge.
2. Every WP’s product diff lives on `$FEATURE_SLUG-$WP_ID` until merge.
3. Review artifacts record test command run from worktree path.
4. No WP markdown instructs merging to `main` before accept.
5. `spec-bridge-merge` is the **first** commit on `main` that introduces the feature’s product code (modulo explicitly documented early mistakes).

---

## References

- Feature artifacts: `specs/019-skills-discovery-invocation/`
- Ad-hoc merge WP: `specs/019-skills-discovery-invocation/tasks/WP06-merge-land.md`
- Skills: `.cursor/skills/spec-bridge-{implement,review,merge,accept,execute}/SKILL.md`
- Session transcript: `agent-transcripts/100c813a-0023-463a-bde6-1c253454296b.jsonl` (WP02 merge-to-main rationale)
