# Aperant Prompt Architecture: Analysis and SyDD Applicability

**Date**: 2026-03-14
**Source**: `apps/desktop/prompts/` from the Aperant (Auto Claude) codebase
**Purpose**: Catalog all 52 agent prompts, summarize their function, and assess how their patterns could be applied to spec-bridge-v2's Synthesis-Driven Development (SyDD) methodology.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Prompt Inventory](#2-prompt-inventory)
   - [Spec Creation Pipeline](#21-spec-creation-pipeline)
   - [Planning Pipeline](#22-planning-pipeline)
   - [Implementation Pipeline](#23-implementation-pipeline)
   - [Quality Assurance Pipeline](#24-quality-assurance-pipeline)
   - [Ideation Pipeline](#25-ideation-pipeline)
   - [Roadmap Pipeline](#26-roadmap-pipeline)
   - [GitHub Integration](#27-github-integration)
   - [MCP Validation Tools](#28-mcp-validation-tools)
   - [Supporting Utilities](#29-supporting-utilities)
3. [Cross-Cutting Patterns](#3-cross-cutting-patterns)
4. [SyDD Applicability Analysis](#4-sydd-applicability-analysis)
   - [Specify Skill Improvements](#41-specify-skill-improvements)
   - [Decompose Skill Improvements](#42-decompose-skill-improvements)
   - [Plan Skill Improvements](#43-plan-skill-improvements)
   - [Tasks Skill Improvements](#44-tasks-skill-improvements)
   - [Implement Skill Improvements](#45-implement-skill-improvements)
   - [Review Skill Improvements](#46-review-skill-improvements)
   - [Accept and Merge Skill Improvements](#47-accept-and-merge-skill-improvements)
   - [New Capabilities](#48-new-capabilities)
5. [Priority Recommendations](#5-priority-recommendations)
6. [Appendix: Full Prompt Map](#6-appendix-full-prompt-map)

---

## 1 Executive Summary

Aperant's prompt architecture contains 52 agent prompts organized into 7 functional pipelines. The system implements a full autonomous software development lifecycle: from spec creation through planning, implementation, QA, to PR review and merge. Several patterns from this architecture directly address gaps in spec-bridge-v2's SyDD workflow.

**Key findings:**

1. **Complexity-routed spec creation** -- Aperant assesses task complexity first, then routes through different spec creation paths (quick vs. standard vs. complex). This maps directly to SyDD's need for deciding whether to invoke the `decompose` skill.

2. **Multi-agent spec pipeline** -- Aperant separates spec creation into 6 specialized agents (gatherer, researcher, writer, critic, validator, orchestrator). spec-bridge-v2's `specify` skill bundles all of this into a single AI interaction. Aperant's separation of concerns -- particularly the critic and validation fixer -- could improve spec quality.

3. **Parallel PR review with finding validation** -- Aperant's PR review runs multiple specialized agents in parallel (security, logic, quality, codebase-fit) and then validates all findings through a dedicated finding-validator agent. This pattern of "analyze then validate" maps to the SyDD review skill's need for misfit verification.

4. **Recovery and learning loops** -- Aperant's coder_recovery and insight_extractor create a feedback loop where failed attempts inform future sessions. SyDD has no equivalent -- failed implementations start fresh.

5. **Ideation pipeline** -- Aperant proactively discovers improvements across 6 domains (code quality, performance, security, UI/UX, documentation, code improvements). This maps to SyDD's concept of identifying new misfits from production reality (Principle 7: Continuous Refinement).

---

## 2 Prompt Inventory

### 2.1 Spec Creation Pipeline

| Prompt | Role | Summary |
|--------|------|---------|
| `spec_orchestrator_agentic.md` | Orchestrator | Drives spec creation by assessing complexity (simple/standard/complex), delegating to subagents, and assembling the final spec. Adapts when subagents fail. |
| `complexity_assessor.md` | Assessor | Classifies tasks as simple/standard/complex using multi-dimensional analysis (scope, integrations, infrastructure, knowledge, risk). Recommends validation depth and phase count. |
| `spec_gatherer.md` | Gatherer | Converts user intent into structured `requirements.json` through clarifying questions and confirmation loops. Classifies workflow type. |
| `spec_researcher.md` | Researcher | Validates external libraries, APIs, and services via Context7 and WebSearch. Produces `research.json` with package names, API patterns, configuration, and gotchas. |
| `spec_writer.md` | Writer | Synthesizes `spec.md` from project_index, requirements.json, and context.json using a fixed template (Overview, Workflow Type, Task Scope, Files to Modify, Patterns, Success Criteria, QA Acceptance Criteria). |
| `spec_critic.md` | Critic | Reviews spec.md for technical accuracy, completeness, consistency, and feasibility. Uses extended thinking and Context7 to validate package references. Fixes issues directly and produces a critique report. |
| `spec_quick.md` | Quick path | Produces minimal spec and single-phase implementation plan for trivial changes (UI tweaks, text updates). No research or deep analysis. |
| `validation_fixer.md` | Fixer | Fixes schema validation errors in spec artifacts. Applies minimal, targeted fixes to context.json, requirements.json, implementation_plan.json, or spec.md. |

**Pipeline flow:**
```
spec_orchestrator -> complexity_assessor -> spec_gatherer -> spec_researcher (if needed)
                                                         -> spec_writer -> spec_critic -> validation_fixer (if needed)
```

### 2.2 Planning Pipeline

| Prompt | Role | Summary |
|--------|------|---------|
| `planner.md` | Planner | Creates subtask-based `implementation_plan.json` from spec. Runs Phase 0 (deep codebase investigation via Glob, Grep, Read), then defines phases and subtasks with verification strategies. Supports 5 workflow types (feature, refactor, investigation, migration, simple). |
| `followup_planner.md` | Follow-up planner | Extends completed specs with new phases and subtasks from a FOLLOWUP_REQUEST. Preserves existing phases, appends new ones with correct numbering and dependency preservation. |

### 2.3 Implementation Pipeline

| Prompt | Role | Summary |
|--------|------|---------|
| `coder.md` | Coder | Implements one subtask at a time. Session memory tracks patterns, gotchas, and codebase map across subtasks. Pre-implementation checklist validates readiness. Mandatory self-critique before commit. Can spawn subagents for complex work. |
| `coder_recovery.md` | Recovery addendum | Adds recovery behavior: checks `attempt_history.json`, records approach before coding, detects circular fixes, marks subtasks as stuck after 3+ failures, and escalates. |

### 2.4 Quality Assurance Pipeline

| Prompt | Role | Summary |
|--------|------|---------|
| `qa_orchestrator_agentic.md` | Orchestrator | Runs the QA loop by spawning qa_reviewer and qa_fixer. Triages issues (critical vs. cosmetic), decides fix vs. approve, escalates after 5 iterations. |
| `qa_reviewer.md` | Reviewer | Validates implementation against spec. Runs unit/integration/E2E tests, visual verification (Electron MCP or Puppeteer), database checks, security review, Context7 for third-party APIs. Produces `qa_report.md`. |
| `qa_fixer.md` | Fixer | Implements fixes from QA_FIX_REQUEST.md. Minimal changes only. Self-verifies before commit. Does not edit qa_report.md. |

### 2.5 Ideation Pipeline

| Prompt | Role | Summary |
|--------|------|---------|
| `ideation_code_quality.md` | Code quality | Finds refactoring opportunities: large files, code smells, duplication, naming, structure, linting, testing gaps, type issues, dead code. Produces `code_quality_ideas.json` with severity and effort. |
| `ideation_performance.md` | Performance | Finds performance bottlenecks: bundle size, runtime, memory, DB queries, network, rendering, caching. Produces `performance_optimizations_ideas.json` with impact and effort. |
| `ideation_code_improvements.md` | Code improvements | Discovers improvements suggested by existing code patterns (extensions, architecture, config, utilities, UI, data). Only suggests ideas that build on existing patterns. |
| `ideation_security.md` | Security | Finds security issues with OWASP Top 10 and CWE mapping. Covers auth, authorization, input validation, data protection, dependencies, config, secrets. |
| `ideation_ui_ux.md` | UI/UX | Finds UI/UX improvements via browser automation (Puppeteer). Covers usability, accessibility, performance perception, visual polish, interaction. |
| `ideation_documentation.md` | Documentation | Finds documentation gaps by cross-referencing docs with code. Covers README, API docs, inline comments, examples, architecture, troubleshooting. |

### 2.6 Roadmap Pipeline

| Prompt | Role | Summary |
|--------|------|---------|
| `roadmap_discovery.md` | Discovery | Infers target audience, product vision, current state, and competitive context from project analysis. Non-interactive. |
| `roadmap_features.md` | Feature generation | Produces phased roadmap with MoSCoW prioritization, complexity/impact scoring, and dependency mapping. Integrates competitor analysis. |
| `competitor_analysis.md` | Competitor analysis | Researches competitors and user pain points via WebSearch, App Store reviews, Reddit. Produces structured analysis with pain points, market gaps, and opportunities. |

### 2.7 GitHub Integration

#### PR Review (Initial)

| Prompt | Role | Summary |
|--------|------|---------|
| `pr_parallel_orchestrator.md` | Primary orchestrator | Runs parallel PR review with 6 mandatory contract-change triggers. Delegates to security, quality, logic, codebase-fit, and AI-triage agents. All findings pass through the finding-validator. Produces verdict (READY_TO_MERGE, MERGE_WITH_CHANGES, NEEDS_REVISION, BLOCKED). |
| `pr_security_agent.md` | Security specialist | OWASP-style review: injection, auth, sensitive data, misconfiguration, validation, crypto, dependencies. Trigger-driven exploration with verification objects. |
| `pr_quality_agent.md` | Quality specialist | Complexity, error handling, duplication, maintainability, edge cases, best practices, testing. Verification-first: "verify before claiming missing." |
| `pr_logic_agent.md` | Logic specialist | Algorithms, edge cases, state management, race conditions. Bounded exploration (depth 1). Requires example inputs/outputs per finding. |
| `pr_codebase_fit_agent.md` | Codebase fit specialist | Naming conventions, pattern reuse, ecosystem fit, architecture alignment. Checks for existing solutions before flagging new patterns. |
| `pr_ai_triage.md` | AI comment triage | Triages comments from other AI review tools (CodeRabbit, Cursor, Gemini). Assigns verdicts and drafts replies. |
| `pr_finding_validator.md` | Finding validator | Re-checks all findings against code to confirm validity or dismiss as false positives. Hypothesis-validation approach. Gate against false positives. |
| `pr_structural.md` | Structural reviewer | Reviews for feature creep, scope coherence, architecture alignment, and PR structure. Max 5 issues. |

#### PR Review (Follow-up)

| Prompt | Role | Summary |
|--------|------|---------|
| `pr_followup_orchestrator.md` | Follow-up orchestrator | Coordinates follow-up reviews: analyzes incremental changes, delegates to resolution-verifier, new-code-reviewer, comment-analyzer, and finding-validator. |
| `pr_followup_resolution_agent.md` | Resolution verifier | Checks if prior findings are resolved, partially resolved, or unresolved. In-scope validation only. |
| `pr_followup_newcode_agent.md` | New code reviewer | Reviews new code added since last review. Looks for regressions, incomplete fixes, and new issues. |
| `pr_followup_comment_agent.md` | Comment analyzer | Classifies new comments (question, concern, suggestion, praise). Triages AI tool feedback. Prioritizes maintainer > contributor > AI. |
| `pr_followup.md` | Single-agent follow-up | Simpler alternative to the multi-agent follow-up orchestrator. Single agent handles all follow-up review phases. |

#### PR Creation and Fixes

| Prompt | Role | Summary |
|--------|------|---------|
| `pr_template_filler.md` | Template filler | Fills GitHub PR templates from spec, diff, commits, and branch context. AI disclosure, breaking-change detection, feature-toggle handling. |
| `pr_fixer.md` | Fix generator | Produces line-level code fixes for PR review findings. JSON output with line ranges, original/replacement code, and test needs. |
| `pr_reviewer.md` | Standalone reviewer | Full single-agent PR review covering security, quality, logic, tests, patterns, and docs. Evidence-first with max 10 findings. |

#### PR System QA

| Prompt | Role | Summary |
|--------|------|---------|
| `QA_REVIEW_SYSTEM_PROMPT.md` | Meta-QA | Audits the PR review system itself. Compares implementation to the "99% trust" vision, checks prompts, schemas, and information flow. |

#### Issue Management

| Prompt | Role | Summary |
|--------|------|---------|
| `issue_analyzer.md` | Issue-to-spec | Extracts structured requirements from GitHub issues for auto-fix. Classifies complexity and readiness. |
| `issue_triager.md` | Issue classifier | Classifies issues (bug, feature, docs, question, duplicate, spam, feature_creep). Suggests labels with confidence thresholds. |
| `spam_detector.md` | Spam filter | Detects spam, troll, and low-quality issues. Conservative (no auto-close). |
| `duplicate_detector.md` | Duplicate finder | Compares target issue to existing issues using semantic similarity and weighted indicators. |

#### Shared Partials

| Prompt | Role | Summary |
|--------|------|---------|
| `partials/full_context_analysis.md` | Shared module | Canonical "full context analysis" rules shared across PR review specialists. Enforces Read tool use, verification, and code evidence before reporting. |

### 2.8 MCP Validation Tools

| Prompt | Role | Summary |
|--------|------|---------|
| `mcp_tools/puppeteer_browser.md` | Browser validation | Stepwise Puppeteer-based UI validation: navigate, screenshot, verify elements, test interactions, check console errors. Structured PASS/FAIL reporting. |
| `mcp_tools/electron_validation.md` | Electron validation | Chrome DevTools Protocol-based Electron app validation. Same flow as Puppeteer but for desktop apps. |
| `mcp_tools/api_validation.md` | API validation | Framework-aware API endpoint validation (FastAPI, Express, Django). Tests success, auth, error cases, and schema compliance. |
| `mcp_tools/database_validation.md` | Database validation | Migration and schema integrity validation across Django, Rails, Prisma, Alembic, Drizzle. Three-phase: exist, apply, match. |

### 2.9 Supporting Utilities

| Prompt | Role | Summary |
|--------|------|---------|
| `insight_extractor.md` | Learning extractor | Extracts structured learnings from completed coding sessions (git diff, subtask history, attempt outcomes). Produces JSON with file insights, patterns, gotchas, and recommendations for future sessions. |

---

## 3 Cross-Cutting Patterns

These architectural patterns appear across multiple Aperant prompts and represent transferable design wisdom:

### 3.1 Complexity-Based Routing

The spec orchestrator assesses complexity first, then routes through different creation paths. This prevents over-engineering simple tasks and under-analyzing complex ones.

**Pattern**: Assess -> Route -> Execute with appropriate depth.

### 3.2 Critic-Validator Separation

Aperant separates the agent that creates artifacts (spec_writer, coder) from the agent that validates them (spec_critic, qa_reviewer) and the agent that fixes validation failures (validation_fixer, qa_fixer). No agent both creates and validates.

**Pattern**: Creator -> Critic -> Fixer, with different agents at each step.

### 3.3 Evidence-First Findings

All PR review agents require code evidence before reporting a finding. The `pr_finding_validator.md` re-checks every finding against the actual code before it reaches the final verdict. False positives are systematically eliminated.

**Pattern**: Claim requires evidence -> Independent validation -> Gate before output.

### 3.4 Parallel Specialization with Synthesis

The PR parallel orchestrator runs domain-specific agents concurrently (security, logic, quality, codebase-fit), then synthesizes their outputs into a unified verdict. Each specialist focuses on one concern and cannot see the others' findings.

**Pattern**: Fork -> Specialize -> Join -> Synthesize.

### 3.5 Attempt History and Recovery

The coder_recovery prompt maintains a structured history of failed approaches. After 3 failures, it escalates rather than retrying. This prevents infinite loops and preserves context about what was already tried.

**Pattern**: Record -> Detect cycles -> Escalate after threshold.

### 3.6 Structured Output Contracts

Every agent produces structured output (JSON or markdown with specific sections). The validation_fixer and qa_fixer can only operate on well-defined schemas. This makes inter-agent communication deterministic.

**Pattern**: Schema-first output -> Machine-parseable -> Fixable by downstream agents.

### 3.7 Conditional Depth

QA validation tools (browser, API, database) conditionally skip validation when changes are not relevant (e.g., no UI changes = skip browser validation). This prevents wasted effort on irrelevant checks.

**Pattern**: Relevance check -> Conditional execution -> Skip with documented reason.

---

## 4 SyDD Applicability Analysis

This section maps Aperant's patterns to spec-bridge-v2's SyDD skills, identifying concrete improvements.

### 4.1 Specify Skill Improvements

#### 4.1.1 Complexity-Routed Specification (from `complexity_assessor.md`)

**Current state**: The `specify` skill treats all features uniformly. The AI agent runs the same discovery interview whether the feature is a single config change or a multi-subsystem rewrite.

**Aperant pattern**: The complexity assessor classifies tasks across 5 dimensions (scope, integrations, infrastructure, knowledge, risk) and routes to different spec creation paths.

**SyDD application**: Add a complexity assessment step to the specify skill's SKILL.md instructions. Before the full discovery interview, the agent performs a quick assessment:

- **Simple** (< 3 misfits expected, single subsystem): Skip the Misfit Interaction Notes subsection. Decomposition can be done inline in plan.md.
- **Standard** (3-5 misfits, 1-2 subsystems): Full specify template as currently designed.
- **Complex** (5+ misfits, 3+ potential subsystems): Full specify template plus a mandatory recommendation to run the `decompose` skill before planning.

This routes SyDD depth to match problem complexity -- Alexander's method is most valuable for complex decompositions but overhead for trivial changes.

**Improvement to SyDD**: Prevents over-engineering small features with unnecessary misfit analysis while ensuring complex features get the full analytical treatment. Addresses the practical concern that teams skip SyDD for simple work because it feels heavyweight.

#### 4.1.2 Spec Critic (from `spec_critic.md`)

**Current state**: The specify skill produces spec.md and the CLI validates its structure (SyDD-S01 through SyDD-S03). But structural validity does not guarantee content quality -- a spec can have a `## Context` section that is vague or a `## Misfits` section with poorly formulated misfits.

**Aperant pattern**: The spec_critic reviews the written spec for technical accuracy, completeness, consistency, and feasibility. It validates external references (package names, API patterns) against actual documentation and fixes issues directly.

**SyDD application**: Add a "spec self-critique" step to the specify SKILL.md instructions. After writing spec.md but before calling `spec-bridge-skill-tool specify`, the agent:

1. Re-reads the spec and checks each misfit for the Alexander criteria: Is it a specific, testable failure? Does it describe how the system fails its context, not what it should do? Is it binary (fit or misfit)?
2. Checks each misfit interaction note: Does resolving Misfit A genuinely force changes to the resolution of Misfit B? Or is the link assumed rather than demonstrated?
3. Verifies external references (library names, API endpoints) if any are mentioned.

This is an instruction-layer change, not a CLI change -- consistent with the CLI vs. skill responsibility boundary.

**Improvement to SyDD**: Raises misfit quality before the decomposition phase. Poor misfits produce poor decompositions. A critic step catches vague requirements disguised as misfits ("the system must be fast" is a requirement, not a misfit; "the API returns stale cache data for 60 seconds after a write" is a misfit).

#### 4.1.3 Research Phase (from `spec_researcher.md`)

**Current state**: The specify skill does not have an explicit research step. If the feature involves external libraries or APIs, the AI agent may or may not investigate them.

**Aperant pattern**: The spec_researcher validates external dependencies via Context7 and WebSearch before the spec is written. This produces a `research.json` with verified package names, API patterns, and gotchas.

**SyDD application**: Add an optional research step to the specify SKILL.md instructions, triggered when the feature involves external integrations. The research findings feed into the Context section (system interactions with external services) and may reveal additional misfits (e.g., "the third-party API has a rate limit of 100 requests/minute" becomes a misfit).

**Improvement to SyDD**: External integration failures are a common source of misfits. Research before specification ensures these misfits are identified upfront rather than discovered during implementation. This strengthens Phase 1 (Context Gathering) of the SyDD workflow.

### 4.2 Decompose Skill Improvements

#### 4.2.1 Structured Interaction Analysis (from `pr_parallel_orchestrator.md` trigger system)

**Current state**: The decompose skill instructs the AI agent to build an interaction matrix and identify subsystem boundaries. But the instructions are general -- "determine whether resolving one forces changes to the resolution of the other."

**Aperant pattern**: The PR parallel orchestrator defines 6 specific contract-change triggers (output contracts, input contracts, behavioral contracts, side-effect contracts, failure contracts, null contracts). Each trigger is a concrete question with defined scope.

**SyDD application**: Replace the general interaction guidance in the decompose template with specific interaction triggers derived from Alexander's method:

1. **Shared state trigger**: Do both misfits touch the same data entity or state?
2. **Causal sequence trigger**: Must one misfit be resolved before the other can be addressed?
3. **Failure propagation trigger**: Does a failure in one misfit's domain cascade into the other's domain?
4. **Resource contention trigger**: Do both misfits compete for the same limited resource (connection pool, API quota, etc.)?
5. **Consistency trigger**: Must both misfits' resolutions maintain the same invariant?

This gives the AI agent concrete questions to ask for each misfit pair, reducing the chance of missed interactions.

**Improvement to SyDD**: The interaction matrix is the most analytically demanding part of SyDD. Vague guidance ("do they interact?") produces superficial analysis. Specific triggers produce rigorous analysis. This is the single most impactful improvement to the decomposition phase.

### 4.3 Plan Skill Improvements

#### 4.3.1 Codebase Investigation Phase (from `planner.md` Phase 0)

**Current state**: The plan skill template includes `## Phase 0: Research` but does not prescribe how the AI agent should investigate the existing codebase.

**Aperant pattern**: The planner runs a deep Phase 0 codebase investigation using Glob, Grep, and Read before creating any plan. It maps file structure, identifies existing patterns, finds relevant test files, and builds a mental model of the codebase.

**SyDD application**: Expand the plan template's Phase 0 section with specific investigation instructions:

1. For each subsystem from the decomposition, identify existing code that already partially addresses the subsystem's misfits.
2. Map existing module boundaries -- do they align with or conflict with the decomposition's subsystem boundaries?
3. Identify existing inter-module contracts (APIs, event buses, shared schemas) that overlap with the plan's inter-system contracts.

This ensures the abstract components are grounded in the actual codebase rather than designed in a vacuum.

**Improvement to SyDD**: Alexander's constructive diagrams must be simultaneously abstract (what is required) and concrete (what structure satisfies the requirement). Codebase investigation grounds the abstract in the concrete. Without it, the AI agent may design components that conflict with existing architecture.

#### 4.3.2 Workflow-Specific Planning (from `planner.md` workflow types)

**Current state**: The plan skill uses a single template regardless of whether the feature is a new capability, a refactor, an investigation, or a migration.

**Aperant pattern**: The planner supports 5 workflow types (feature, refactor, investigation, migration, simple), each with a different phase structure and verification strategy.

**SyDD application**: Add workflow-type awareness to the plan template. The decomposition structure varies by workflow type:

- **Feature**: Full decomposition with new subsystems, abstract components, and inter-system contracts.
- **Refactor**: Decomposition focuses on existing subsystem boundaries and how they should change. Misfits are "structural misfits" (coupling, cohesion violations) rather than functional failures.
- **Migration**: Decomposition identifies source and target subsystems, migration contracts (data transformation, dual-write, cut-over), and rollback misfits.
- **Investigation**: Minimal decomposition; the plan is primarily a research protocol.

**Improvement to SyDD**: SyDD currently assumes all work is "build a new feature." Real software development includes refactoring, migration, and investigation workflows where the decomposition has different character. Workflow-type awareness prevents forcing the full SyDD apparatus on tasks where a lighter touch is appropriate.

### 4.4 Tasks Skill Improvements

#### 4.4.1 Parallelism Analysis (from `planner.md`)

**Current state**: The tasks template includes a dependency graph and execution schedule, but the guidance on parallelism is generic.

**Aperant pattern**: The planner explicitly analyzes which subtasks can run in parallel (no data dependencies, no shared files, no order-sensitive outputs) and which must be sequential.

**SyDD application**: Enhance the Misfit Coverage Matrix with a parallelism analysis column. If two WPs address misfits in different subsystems (sparse external coupling by definition), they are candidates for parallel execution. If they share a subsystem, they likely have dependencies and must be sequential.

The SyDD decomposition directly enables this: subsystem independence is the criterion for safe parallelism.

**Improvement to SyDD**: Makes the connection between decomposition quality and execution efficiency explicit. A good decomposition (independent subsystems) yields more parallelizable WPs. A poor decomposition (entangled subsystems) forces sequential execution. This creates a measurable incentive for rigorous decomposition.

#### 4.4.2 TDD Target Specificity (from `qa_reviewer.md`)

**Current state**: The tasks template includes `TDD Targets (from Misfits)` as a checklist, but the format is open-ended.

**Aperant pattern**: The QA reviewer runs multi-phase verification: unit tests, integration tests, E2E tests, visual verification, database checks, security review. Each phase has specific criteria.

**SyDD application**: Refine TDD Targets to classify each misfit-derived test by verification type:

- **Unit**: Misfit can be tested in isolation (e.g., "cart with zero items is rejected")
- **Integration**: Misfit requires interaction between components (e.g., "payment failure releases inventory hold")
- **Contract**: Misfit involves inter-system boundary (e.g., "OrderReceipt schema matches Payment consumer expectation")
- **E2E**: Misfit requires full system context (e.g., "user sees error message when delivery address is out of range")

**Improvement to SyDD**: Connects misfit analysis directly to test strategy. Each misfit type implies a test type. This makes the TDD-from-misfits workflow more actionable and ensures appropriate test coverage at each level.

### 4.5 Implement Skill Improvements

#### 4.5.1 Session Memory and Self-Critique (from `coder.md`)

**Current state**: The implement skill instructs the agent to create a worktree, implement the WP, and transition the lane. Each implementation session starts fresh.

**Aperant pattern**: The coder maintains session memory across subtasks: patterns discovered, gotchas encountered, and a codebase map. Before committing, the coder performs a mandatory self-critique: "What could go wrong with this implementation?"

**SyDD application**: Add two workflow steps to the implement SKILL.md:

1. **Pre-implementation context load**: Before coding, read all WPs in the same subsystem that are already completed. Note patterns and decisions they established. This ensures consistency within a subsystem.
2. **Post-implementation self-critique**: After coding but before committing, check:
   - Does this implementation respect the subsystem boundary? (No imports from other subsystems outside contracted interfaces)
   - Does each misfit have a test that would fail if the misfit were reintroduced?
   - Did I introduce any new failure modes not covered by the spec's misfits?

**Improvement to SyDD**: The self-critique step catches subsystem boundary violations before review, reducing the review cycle. The context load step prevents inconsistencies within a subsystem when WPs are implemented over multiple sessions.

#### 4.5.2 Recovery and Attempt History (from `coder_recovery.md`)

**Current state**: If implementation fails, the agent retries from scratch. There is no structured record of what was tried and why it failed.

**Aperant pattern**: The coder_recovery system maintains an `attempt_history.json` that records each approach, its outcome, and the failure reason. After 3 failed attempts, the subtask is marked as "stuck" and escalated.

**SyDD application**: Add an optional recovery protocol to the implement SKILL.md:

1. If the WP implementation fails validation (`spec-bridge-skill-tool implement` returns non-zero), record the approach and failure in the WP frontmatter or a sidecar file.
2. On retry, read previous attempts. Do not repeat a failed approach.
3. After 3 failures, add a `status: stuck` to the WP frontmatter and flag the misfit(s) that could not be resolved. This signals a potential decomposition problem -- the misfits assigned to this WP may interact with misfits in other subsystems, requiring a decomposition revision.

**Improvement to SyDD**: Failed implementations can signal decomposition failures. If a WP cannot resolve its assigned misfits, the subsystem boundaries may be wrong. The recovery protocol creates a feedback loop from Phase 4 (Synthesis) back to Phase 2 (Decomposition), implementing SyDD Principle 7 (Continuous Refinement).

### 4.6 Review Skill Improvements

#### 4.6.1 Parallel Specialized Review (from `pr_parallel_orchestrator.md`)

**Current state**: The review skill runs a single AI agent that checks misfit resolution, subsystem boundary respect, contract compliance, and no new misfits.

**Aperant pattern**: The PR parallel orchestrator runs 4+ specialized agents in parallel, each focused on one concern (security, logic, quality, codebase-fit). A finding-validator then re-checks all findings.

**SyDD application**: While spec-bridge-v2 cannot orchestrate parallel agents (it is a validation harness, not an orchestrator), the SKILL.md instructions can structure the review into distinct phases that mirror the specialist separation:

1. **Misfit Resolution Phase**: For each misfit in `misfits_addressed`, verify a test exists and passes.
2. **Boundary Compliance Phase**: Scan imports and function calls for cross-subsystem references not declared in contracts.
3. **Contract Compliance Phase**: If the WP implements a contract, verify producer/consumer/failure-mode alignment with plan.md.
4. **Regression Phase**: Check that no existing tests broke and no new failure modes were introduced.

Structuring the review into phases prevents the AI agent from conflating different concerns and reduces the chance of shallow review.

**Improvement to SyDD**: Phased review ensures each SyDD verification criterion gets dedicated attention. A single-pass review tends to focus on the most obvious issues and miss subtle boundary violations.

#### 4.6.2 Finding Validation Gate (from `pr_finding_validator.md`)

**Current state**: The review skill produces findings that go directly into the WP's review status. There is no independent validation step.

**Aperant pattern**: Every PR finding passes through a dedicated finding-validator that re-checks it against the actual code. The validator can dismiss false positives.

**SyDD application**: Add a "validate your findings" step to the review SKILL.md. After the reviewer identifies issues, it re-reads the relevant code for each finding and confirms:

- The code evidence actually demonstrates the issue (not a misreading)
- The issue is within the WP's scope (not a pre-existing problem)
- The issue genuinely violates a misfit resolution or boundary contract (not a style preference)

**Improvement to SyDD**: Reduces false positives in review, which is especially important because review findings can trigger implementation rework. A false positive sends the WP back to implementation unnecessarily.

### 4.7 Accept and Merge Skill Improvements

#### 4.7.1 Misfit Coverage Verification at Accept (from `qa_reviewer.md`)

**Current state**: The accept skill verifies all WPs are in `lane: done` and all artifacts exist. It does not verify that every misfit from the spec was actually addressed.

**Aperant pattern**: The QA reviewer validates implementation against spec -- not just that code exists, but that it satisfies the spec's criteria.

**SyDD application**: Add a misfit coverage check to the accept skill's outcome verification:

1. Parse the Misfit Coverage Matrix from tasks.md.
2. For each misfit, verify the assigned WP(s) are in `lane: done`.
3. If any misfit has no WP in `lane: done`, the accept check fails with a list of unresolved misfits.

This is a CLI-layer change (outcome verification), not a skill-layer change, and it belongs in the accept contract because it verifies feature-level completeness.

**Improvement to SyDD**: Closes the traceability loop. Misfits flow from spec -> decomposition -> plan -> tasks -> implementation -> review -> accept. The accept skill's misfit coverage check ensures nothing fell through the cracks during the multi-step process.

### 4.8 New Capabilities

#### 4.8.1 Ideation-to-Misfits Pipeline (from `ideation_*.md`)

**Current state**: SyDD identifies misfits during spec creation (Phase 1). Post-deployment, there is no systematic way to discover new misfits from production reality.

**Aperant pattern**: The ideation pipeline proactively discovers improvements across 6 domains. Each ideation agent produces structured findings with severity and effort.

**SyDD application**: Create a new utility (not a skill -- it does not produce a spec-bridge artifact) that runs ideation-style analysis on a codebase and outputs potential misfits in the SyDD format:

- **Code quality ideation** -> Structural misfits (high coupling, low cohesion, dead code)
- **Performance ideation** -> Performance misfits (slow queries, memory leaks, bundle bloat)
- **Security ideation** -> Security misfits (injection vectors, auth gaps, exposed secrets)
- **Documentation ideation** -> Knowledge misfits (undocumented behavior, missing API docs)

These misfits feed into new spec.md files for the next development cycle, implementing SyDD Principle 7 (Continuous Refinement): "Production reality informs specification evolution. Metrics, incidents, and operational learnings become new misfits that trigger the next iteration."

**Improvement to SyDD**: Transforms SyDD from a linear pipeline (specify -> merge) into a continuous cycle. Misfits are not just identified at spec time -- they are continuously discovered from the running system and fed back into the specification process.

#### 4.8.2 Insight Extraction for Cross-Feature Learning (from `insight_extractor.md`)

**Current state**: Each feature's implementation is independent. Lessons learned during one feature's WPs do not inform the next feature.

**Aperant pattern**: The insight_extractor captures structured learnings from completed sessions: patterns, gotchas, approach outcomes, and recommendations. These persist across sessions.

**SyDD application**: Add an optional "retrospective" step after the merge skill completes. The agent reviews:

1. Which misfits were hardest to resolve? (Indicates areas where the decomposition was weak)
2. Which subsystem boundaries caused merge conflicts? (Indicates decomposition failures)
3. Which inter-system contracts required revision during implementation? (Indicates insufficient design in Phase 3)
4. What new patterns or conventions were established? (Feeds into future plans)

The output is a `retrospective.md` sidecar in the feature directory. This is not a skill (no CLI validation) -- it is a knowledge artifact for human review.

**Improvement to SyDD**: Creates organizational learning. Over time, the team accumulates insights about which decomposition patterns work well, which interaction triggers reveal the most important subsystem boundaries, and which types of misfits are hardest to resolve. This meta-knowledge improves future SyDD cycles.

---

## 5 Priority Recommendations

Ranked by impact-to-effort ratio, here are the recommended improvements to spec-bridge-v2's SyDD implementation:

### P0: High Impact, Low Effort (instruction-layer changes only)

| # | Improvement | Source Pattern | Skill Affected |
|---|-------------|----------------|----------------|
| 1 | **Specific interaction triggers for decomposition** | PR parallel orchestrator triggers | decompose |
| 2 | **Spec self-critique step** | spec_critic | specify |
| 3 | **Phased review structure** | PR specialist separation | review |
| 4 | **Finding validation gate** | pr_finding_validator | review |
| 5 | **Pre-implementation context load** | coder session memory | implement |

These are all SKILL.md instruction changes. No CLI code, no schema changes, no new contracts. They improve the AI agent's behavior within the existing SyDD framework.

### P1: High Impact, Medium Effort (instruction + minor schema changes)

| # | Improvement | Source Pattern | Skill Affected |
|---|-------------|----------------|----------------|
| 6 | **Complexity-routed specification** | complexity_assessor | specify |
| 7 | **TDD target classification by verification type** | QA reviewer phases | tasks |
| 8 | **Parallelism analysis from decomposition** | planner parallelism | tasks |
| 9 | **Recovery protocol with attempt history** | coder_recovery | implement |

These require minor additions to WP frontmatter or template structure.

### P2: Medium Impact, Higher Effort (CLI contract changes)

| # | Improvement | Source Pattern | Skill Affected |
|---|-------------|----------------|----------------|
| 10 | **Misfit coverage verification at accept** | QA reviewer vs. spec | accept |
| 11 | **Workflow-type-aware planning** | planner workflow types | plan |

These require contract changes (`SkillOutputContract` modifications).

### P3: New Capabilities (standalone additions)

| # | Improvement | Source Pattern | Skill Affected |
|---|-------------|----------------|----------------|
| 12 | **Ideation-to-misfits pipeline** | ideation_* agents | new utility |
| 13 | **Post-merge retrospective** | insight_extractor | new artifact |
| 14 | **Research step for external integrations** | spec_researcher | specify |

These are new features that extend the SyDD lifecycle.

---

## 6 Appendix: Full Prompt Map

### Pipeline Architecture

```
SPEC CREATION PIPELINE
  spec_orchestrator_agentic -----> complexity_assessor
                            \----> spec_gatherer ---------> spec_researcher (conditional)
                             \---> spec_writer
                              \--> spec_critic
                               \-> validation_fixer (recovery)
  spec_quick (fast path)

PLANNING PIPELINE
  planner ----> implementation_plan.json
  followup_planner ----> extends existing plan

IMPLEMENTATION PIPELINE
  coder + coder_recovery ----> subtask implementation

QA PIPELINE
  qa_orchestrator_agentic ----> qa_reviewer ----> qa_fixer (loop, max 5)

IDEATION PIPELINE (6 parallel agents)
  ideation_code_quality        ideation_performance
  ideation_code_improvements   ideation_security
  ideation_ui_ux               ideation_documentation

ROADMAP PIPELINE
  roadmap_discovery ----> competitor_analysis ----> roadmap_features

GITHUB PR REVIEW (Initial)
  pr_parallel_orchestrator ----> pr_security_agent
                            \--> pr_quality_agent
                             \-> pr_logic_agent
                              \> pr_codebase_fit_agent
                               > pr_ai_triage
                            ----> pr_finding_validator (gate)

GITHUB PR REVIEW (Follow-up)
  pr_followup_orchestrator ----> pr_followup_resolution_agent
                            \--> pr_followup_newcode_agent
                             \-> pr_followup_comment_agent
                              -> pr_finding_validator (gate)

GITHUB ISSUES
  issue_triager ----> spam_detector
                \---> duplicate_detector
                 \--> issue_analyzer (to spec pipeline)

MCP VALIDATION
  puppeteer_browser    electron_validation
  api_validation       database_validation

UTILITIES
  insight_extractor    pr_template_filler    pr_fixer
```

### SyDD Phase Mapping

| SyDD Phase | Aperant Equivalent | Key Pattern to Transfer |
|------------|-------------------|------------------------|
| Phase 1: Context Gathering | spec_orchestrator + gatherer + researcher | Complexity routing, research step, structured requirements |
| Phase 2: Decomposition | (no direct equivalent) | Trigger-based interaction analysis from PR orchestrator |
| Phase 3: Design | planner Phase 0 + Phase 1 | Codebase investigation, workflow-type awareness |
| Phase 4: Synthesis | coder + coder_recovery | Session memory, self-critique, attempt history, recovery |
| Phase 5: Verification | qa_orchestrator + PR review pipeline | Parallel specialization, finding validation, phased review |
| Continuous Refinement | ideation pipeline + insight_extractor | Proactive misfit discovery, cross-feature learning |

---

*End of analysis.*
