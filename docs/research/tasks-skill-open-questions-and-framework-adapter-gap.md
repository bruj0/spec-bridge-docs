# Research: Tasks Skill Misses Framework Adapter WPs from Unresolved Plan Open Questions

**Date**: 2026-05-20
**Source**: Observed during feature `012-markdown-editor-architecture-for-monaco`
(deepagent project). The `tasks` skill generated four WPs (WP01-WP04) from
`plan.md`, but missed the `EditorPane` class adapter layer entirely. WP05 was
added retroactively after the gap was discovered post-WP02 review.
**Purpose**: Document the structural chain — wrong API in research → wrong API
in plan → unanswered open question silently ignored by tasks skill → implement
skill discovers API mismatch → placeholder code → retroactive WP — and propose
improvements to break it.

---

## 1. Executive Summary

The `tasks` skill generates work packages by decomposing `plan.md`'s abstract
components into implementable units. It does not:

1. Read or act on the **Open Questions** section of `plan.md`.
2. Detect when a plan's described API shape implies a different code artifact
   than what the real library requires.
3. Generate **conditional WPs** whose content depends on an unverified API
   assumption.

As a result, when `plan.md` contained a wrong `registerEditorPane` API signature
(object form) and an explicit open question flagging uncertainty about it, the
`tasks` skill generated WP02 faithfully from the wrong design. The implement
skill later discovered the actual class-based API but had no prescribed workflow
to update the plan, add a new WP, or flag the current WP as intentionally
incomplete. The WP was approved with placeholder code. WP05 (the missing
`EditorPane` adapter) was created only because a reviewer noticed the gap.

---

## 2. The Evidence Chain

### Step 1 — Research described the wrong API

`research.md` (Research Session 1, Area 3) documented:

```typescript
registerEditorPane({
  id: 'markdown-preview',
  name: 'Markdown Preview',
  globPattern: '**/*.md',
  renderBody: (container) => {
    // React.createRoot(container).render(<MarkdownPreviewPane />)
    // Returns: { dispose(), setInput(editorInput) }
  }
});
```

This is an **object-argument form** that does not exist in
`@codingame/monaco-vscode-api` v32. The actual v32 API is class-based:

```typescript
registerEditorPane<Services extends BrandedService[]>(
  typeId: string,
  name: string,
  ctor: new (group: IEditorGroup, ...services: Services) => EditorPane<object>,
  inputCtors: (new (...args: any[]) => EditorInput)[]
): IDisposable
```

The difference is fundamental: the object form embeds the React mounting inline
in a `renderBody` callback, requiring no separate class. The class form requires
an `EditorPane` subclass as a standalone code artifact.

### Step 2 — Plan encoded the wrong API and left an open question

`plan.md` repeated the object-form API verbatim (line 163):

> `registerEditorPanes()` … calls `registerEditorPane({ id: 'markdown-preview',
> globPattern: '**/*.md', renderBody })` and …

But `plan.md` also included an open question (line 336) that explicitly flagged
the uncertainty:

```markdown
## Open Questions

- [ ] Does `registerEditorPane` in monaco-vscode-api v32 support async
  `renderBody` (needed to lazy-import `react-dom/client`)? Verify against v32
  type definitions before WP02 starts. If not, pre-import `createRoot` at
  module load time.
```

This question asked whether `renderBody` could be `async`. It was asking about
the wrong property entirely — `renderBody` does not exist in v32 at all — but it
correctly identified that the API shape needed to be verified before WP02 started.

### Step 3 — The `tasks` skill generated WPs without processing the open question

The `tasks` skill read `plan.md` and generated four WPs:

| WP | Description from plan |
|----|-----------------------|
| WP01 | MermaidDiagram shared component |
| WP02 | `MarkdownPreviewPane` + `registerEditorPanes` + `IdeShell` wiring |
| WP03 | `DiagramViewerPane` |
| WP04 | Bridge tool + agent-ui integration |

The open question was not:
- Surfaced to the agent as a precondition for WP02.
- Converted into a verification subtask in WP02.
- Used to generate a conditional WP ("if API is class-based, add WP for
  EditorPane adapter").

WP02's prompt was generated as if the question was already resolved, describing
the work in terms of the plan's (wrong) object-form API.

### Step 4 — The implement skill discovered the mismatch but had no update path

During WP02 implementation, the agent inspected the real v32 type definitions and
found the actual class-based API. The research discrepancy was noted in the
implementation, but the `implement` SKILL.md has no step that says:

> "If you discover that the plan's API description does not match the real
> library, stop. Update `plan.md` to reflect the correct API. Add a new WP for
> any missing code artifacts this discovery implies. Flag this WP as
> intentionally incomplete in its frontmatter before proceeding."

Instead, the agent:
- Implemented `registerEditorPanes.ts` as a two-argument placeholder call:
  ```typescript
  registerPane("markdown-preview", "Markdown Preview"); // missing ctor, inputCtors
  ```
- Added an `as unknown as` cast with a comment:
  ```typescript
  // WP02 placeholder; ctor and inputCtors added in WP03
  registerPane: _registerEditorPane as unknown as RegisterEditorPanesDeps["registerPane"]
  ```
- Wrote an implementation summary that did not flag the WP as incomplete.
- The WP passed `spec-bridge-skill-tool implement` validation (7/7 checks).
- The WP was reviewed and approved despite the TypeScript cast and placeholder.

### Step 5 — WP05 was added retroactively, outside any skill workflow

After the review, the reviewer recognized from the `as unknown as` cast and the
code comments that `MarkdownPreviewPane` would never actually render when a `.md`
file was opened — the editor service had a named pane type but no renderer. WP05
(`Monaco EditorPane Adapter Layer`) was created manually in the planning root, not
through any `tasks` skill run.

**The complete chain:**

```
research.md: wrong API (object form) ─────────────────────────┐
                                                               │ faithfully encoded
plan.md: wrong API + open question (unread by tasks skill) ────┤
                                                               │ generated from wrong plan
tasks skill: WP01-WP04, no adapter WP ─────────────────────────┤
                                                               │ discovered mismatch, no update path
implement skill (WP02): placeholder + as-unknown-as cast ──────┤
                                                               │ approved despite placeholder
review skill (WP02 v2): approved ──────────────────────────────┤
                                                               │ manually noticed after review
WP05 added retroactively (outside skill workflow) ─────────────┘
```

---

## 3. Root Cause Analysis

### 3.1 The `tasks` skill ignores the Open Questions section

`plan.md` has a structured `## Open Questions` section with `[ ]` checkboxes.
The tasks SKILL.md instructs the agent to decompose the plan into WPs, but it
has no step that says:

> "Read the Open Questions section. For each unanswered question (`- [ ]`):
> - If it is an API or integration assumption, generate a verification subtask
>   in the first WP that touches that component.
> - If the question's answer could materially change the code structure
>   (e.g. 'does this API use callbacks or classes?'), generate a conditional WP
>   that implements the alternative structure if the verification reveals it."

This is a structural omission. The Open Questions section exists precisely to
capture things that need to be verified before implementation begins, but the
tasks skill does not act on it.

### 3.2 The tasks skill has no "framework adapter WP" detection heuristic

When a plan says "call `registerEditorPane({ renderBody })`", the tasks skill
cannot distinguish between:

- **Inline integration** (the function accepts a callback; no separate class
  needed): the existing WP covers it.
- **Class-based lifecycle adapter** (the framework requires a subclass with
  `renderBody`, `setInput`, `dispose`, etc.): a separate WP for the adapter
  class is required.

A heuristic that would have caught this: when a plan component registers with an
external framework via a function call, ask whether the framework's registration
API requires a **class implementing a framework interface**. If yes, the class is
a separate code artifact from the component it mounts, and belongs in its own WP.

### 3.3 The `implement` skill has no "plan gap" update path

When the implementing agent discovers that a plan's technical design is wrong,
the `implement` SKILL.md has no prescribed response. The closest it comes is the
M6 (API drift) misfit pattern: "add an integration test that fails when the API
changes." But M6 covers drift in a working registration — it does not address
discovering that the plan's described API was never correct.

The result is that implementing agents are incentivized to work around API
mismatches with placeholders and casts rather than stopping, updating the plan,
and creating new WPs. The `spec-bridge-skill-tool implement` validation does not
check for the presence of unexplained `as unknown as` casts or placeholder
comments.

---

## 4. Proposed Improvements

### Improvement A: `tasks` skill — Process Open Questions before generating WPs

**Change to `spec-bridge-tasks` SKILL.md**: Add a step before WP generation:

```markdown
### Step N — Resolve Open Questions

Read the `## Open Questions` section of `plan.md`. For each unanswered item
(marked `- [ ]`):

1. **API / library question**: Add a verification subtask to the earliest WP
   that touches the uncertain component. Example:
   > T000 Verify `registerEditorPane` signature against installed library type
   > definitions. If the real API differs from the plan description, update
   > `plan.md` before implementing.

2. **Structural question** (question answer changes what code artifacts exist):
   Pause and resolve the question NOW, before generating any WPs. The answer
   may require adding a new WP candidate to the plan's WP table. Update
   `plan.md` first, then generate WPs from the updated plan.

3. **Deferrable question** (does not affect WP boundaries or API shape):
   Carry it forward into the relevant WP's prompt as a "decision deferred to
   WP-N kickoff" note.

Do not generate WPs from a plan that has unresolved structural questions.
```

This single change would have forced resolution of the `registerEditorPane` API
question before WP02 was generated. The correct class-based API would have been
discovered at plan→tasks time, and the WP table would have included a WP for the
`EditorPane` adapter class.

### Improvement B: `tasks` skill — Framework adapter WP detection heuristic

**Change to `spec-bridge-tasks` SKILL.md**: Add a heuristic step after WP
candidate generation:

```markdown
### Step N — Framework Adapter WP Check

For each abstract component that is registered with an external framework
(Monaco, VS Code, React router, browser extension, etc.):

Ask: "Does registering this component require implementing a class or interface
from the framework (e.g. an `EditorPane` subclass, a `TreeDataProvider`,
a `WorkspaceSymbolProvider`, a content script lifecycle class)?"

If YES:
- The React/Python component and the framework adapter class are two distinct
  code artifacts.
- Create a separate WP for the adapter. Dependency: the component WP.
- The component WP implements the component in isolation (testable without the
  framework).
- The adapter WP implements the framework class that mounts the component and
  manages the framework lifecycle (setInput, dispose, etc.).

If the plan already describes the adapter class as an abstract component,
verify it has its own WP. If not, add it.
```

**Practical trigger words** to look for in plan.md abstract component
descriptions:

| Phrase | Likely requires adapter WP |
|--------|-----------------------------|
| "registered via `registerEditorPane`" | Yes — EditorPane subclass |
| "registered as a VS Code TreeDataProvider" | Yes — TreeDataProvider subclass |
| "mounted in Monaco editor area" | Yes — likely EditorPane or decorator |
| "exposed as an extension command" | Maybe — CommandHandler if stateful |
| "wired into the bridge factory function" | Maybe — check if factory requires a Protocol/ABC |

### Improvement C: `implement` skill — Plan Gap Detection step

**Change to `spec-bridge-implement` SKILL.md**: Add a step when an API mismatch
is discovered:

```markdown
### Step N — API Mismatch Protocol

If, during implementation, you discover that a library's actual API differs
materially from what `plan.md` describes (different function signature,
class-based vs. functional, missing method, different lifecycle):

1. **STOP implementing.**
2. Record the discovery:
   - Note the discrepancy in the WP frontmatter under `api_discovery`.
   - Update `plan.md`'s relevant abstract component description with the
     correct API.
   - Mark the open question in `plan.md` as `[x]` with the resolution.
3. **Assess impact on WP scope**:
   - If the correct API requires a code artifact not covered by any WP
     (e.g. an `EditorPane` subclass that the plan did not anticipate),
     add a new WP to `tasks.md` and commit it to the planning root before
     proceeding.
   - Set the new WP as a dependency of subsequent WPs that rely on it.
4. **Implement the current WP with a documented placeholder** if the missing
   artifact belongs in a future WP:
   - The placeholder MUST be clearly marked with a comment referencing the
     new WP ID: `// WP05: MarkdownEditorPane — placeholder, full ctor in WP05`
   - The WP implementation summary MUST list the new WP and state that the
     current WP is intentionally incomplete.
5. **Flag `tdd_red_clean: partial`** in the WP frontmatter if tests cannot
   fully exercise the placeholder path.

Do NOT submit a WP for review that contains unexplained `as unknown as` casts
or framework-facing placeholder calls without a corresponding entry in the WP
table.
```

### Improvement D: `plan` skill — Verify API signatures before finalising

**Change to `spec-bridge-plan` SKILL.md**: Add an API verification sub-step
when the plan encodes an external library function call:

```markdown
### Step N — API Shape Verification

For each external library function call encoded in an abstract component
description:

1. Look up the function's type definition in the installed `node_modules` or
   `site-packages`. Do not rely on online documentation or training data.
2. Compare the plan's described call signature against the real type definition.
3. If they differ:
   - Update the plan description with the correct signature.
   - If the correct signature requires a different code structure (callback vs.
     class, sync vs. async), re-evaluate whether additional abstract components
     are needed.
   - Record the discrepancy in the plan's `## Open Questions` section with
     verdict: `[x] Resolved: real API is <description>`.
4. If a type definition cannot be found (uninstalled library, generated types):
   - Leave the open question marked `[ ]` and add a note: "Verify type
     definition before WP generation."
   - The `tasks` skill will handle it per Improvement A.
```

---

## 5. Recommendation

Priority order:

| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| A | `tasks` skill: process Open Questions before WP generation | Low | High — stops the cascade at plan→tasks time |
| C | `implement` skill: API mismatch protocol | Low | High — stops silent placeholders; creates traceable WP links |
| B | `tasks` skill: framework adapter WP heuristic | Medium | Medium — catches a pattern class that A doesn't cover |
| D | `plan` skill: API verification step | Medium | Medium — prevents wrong APIs from entering plan.md |

Improvement A alone would have prevented WP05 from being retroactive: the open
question in `plan.md` would have been resolved at tasks-generation time, the
correct class-based API would have been discovered, and a "framework adapter" WP
would have been in the original WP01-WP05 set.

---

## 6. What a Correct Task Generation Would Have Looked Like

If the `tasks` skill had processed the open question and run the API verification:

**Resolved open question entry in plan.md:**
```markdown
- [x] `registerEditorPane` v32 API is class-based, not callback-based.
  Real signature: `registerEditorPane(typeId, name, ctor, inputCtors)`.
  The `renderBody` callback form does not exist in v32.
  Impact: WP02 must split into (a) the React component and (b) the EditorPane
  adapter class. The adapter requires its own WP because it depends on the
  React component existing first (can't mount what doesn't exist).
```

**Updated WP table in plan.md:**

| Phase | WP | Description |
|-------|----|-------------|
| 1 | WP01 | MermaidDiagram shared component |
| 2 | WP02 | MarkdownPreviewPane React component + registerEditorPanes routing stub |
| 2 | WP03 | DiagramViewerPane React component |
| 3 | WP04 | MarkdownEditorPane + DiagramEditorPane (EditorPane adapters); complete registerEditorPane calls |
| 4 | WP05 | Bridge tool + agent-ui integration |

This is structurally equivalent to the retroactively created WP05, but arrived at
before any implementation was written.

---

## 7. Related Files

| File | Relevance |
|------|-----------|
| `skill-tool/src/skill_tool/adapters/templates/tasks.md` (or equivalent) | SKILL.md source — add Open Questions step and framework adapter heuristic |
| `skill-tool/src/skill_tool/adapters/templates/implement.md` | SKILL.md source — add API mismatch protocol |
| `skill-tool/src/skill_tool/adapters/templates/plan.md` | SKILL.md source — add API verification step |
| `deepagent/specs/012-markdown-editor-architecture-for-monaco/plan.md` | Primary evidence — line 336 open question, line 163 wrong API, lines 293-298 WP table |
| `deepagent/specs/012-markdown-editor-architecture-for-monaco/tasks/WP05-monaco-pane-adapter.md` | The retroactively-added WP that Improvement A would have generated automatically |
