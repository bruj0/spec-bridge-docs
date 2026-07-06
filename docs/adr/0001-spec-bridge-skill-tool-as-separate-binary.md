# ADR 0001: spec-bridge-skill-tool as a Separate Binary

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

The spec-bridge workflow involves AI agents following skill instruction sets to create and modify
artifacts (`spec.md`, `plan.md`, work packages, etc.). Without a deterministic validation layer,
the AI agent can produce structurally incorrect artifacts (wrong frontmatter fields, empty required
sections, incorrect lane transitions) and report success -- the failure is silent.

A validation CLI is needed that an AI agent can invoke at the end of each skill to confirm that
the artifact meets its structural and content requirements.

Options considered:

1. **Extend the existing `spec-bridge` CLI** (`src/specify_cli/`) with new validation sub-commands
2. **Create a new, separately installed CLI binary** (`spec-bridge-skill-tool`) in an isolated
   `skill-tool/` package at the repository root
3. **Add validation as a library** called by AI agent code directly (no CLI)

---

## Decision

**Option 2**: A separate binary in an isolated `skill-tool/` package.

The binary is named `spec-bridge-skill-tool` and lives in `skill-tool/` at the repository root.
It provides the sub-commands: `specify`, `plan`, `tasks`, `implement`, `review`, `accept`,
`merge`, and `init`.

---

## Rationale

### Separate tool for a separate audience

`spec-bridge` (v1) is a developer-facing CLI for managing features and work packages.
`spec-bridge-skill-tool` is an AI agent harness: it is invoked by agents, not developers,
and its only job is to confirm that a skill's outcomes are correct. Coupling these two binaries
creates upgrade pressure and mixed responsibility in a single install.

### Independent versioning

The harness has a different release cadence and deployment model than `spec-bridge-cli`:
- `spec-bridge-cli` is a developer tool used to manage features and work packages.
- `spec-bridge-skill-tool` is an AI agent harness used at skill execution time.

Coupling them creates unnecessary upgrade pressure. Both packages can be versioned and released
independently.

### Separation of concerns

`spec-bridge` manages the feature workflow CLI for human developers. `spec-bridge-skill-tool`
is a deterministic gate for AI agent skill execution. These are different tools with different
users (developers vs. AI agents executing structured workflows).

### Skill isolation

The `skill-tool/` package structure (`src/skill_tool/skills/<skill>/skill.py`) gives each skill
its own isolated module. This is easier to understand, test, and extend compared to a monolithic
structure.

### Option 3 rejected

A library-only approach (no CLI) would require the AI agent to import and call Python code
directly, which is not compatible with all AI agent execution environments and makes the
harness harder to invoke from shell-based skill files.

---

## Consequences

### Positive

- Skills and the harness can be versioned and deployed independently
- Isolated module structure makes individual skills easy to understand, test, and extend
- The CLI interface (`spec-bridge-skill-tool <skill>`) is consistent with how AI agents invoke
  external tools from generated skill files
- Full test isolation: `pytest skill-tool/` tests only the harness

### Negative

- Developers must install two packages: `pip install -e spec-bridge-cli/` and
  `pip install -e skill-tool/`
- Any shared logic between the two tools must be extracted into a shared library or duplicated

### Mitigation

The dual install step is automated by `spec-bridge-skill-tool init` instructions in the project
README's **Companion Tools** section.

---

## References

- Feature spec: `specs/043-modular-skill-aligned-cli-refactor/spec.md`
- Constitution: `.spec-bridge/memory/constitution.md`
- Implementation: `skill-tool/` package at repository root
