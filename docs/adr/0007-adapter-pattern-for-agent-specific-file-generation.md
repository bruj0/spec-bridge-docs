# ADR 0007: Adapter Pattern for Agent-Specific File Generation

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

`spec-bridge-skill-tool init` sets up a project to use the skill-based SDD workflow. Part of
this setup is generating agent-specific files: skill instruction sets, command stubs, and
configuration files that the AI agent (e.g., Cursor) uses to invoke skills.

Different AI agents have different file format requirements:
- Cursor uses `.cursor/skills/<skill>/SKILL.md` files with specific frontmatter.
- Other future agents (GitHub Copilot, Claude Code, Windsurf, etc.) have their own conventions.

The tool must generate the correct files for each agent without mixing agent-specific logic into
the core tool or into individual skill modules.

Options considered:

1. **Hardcode all agents in `init`**: The `init` command contains `if agent == "cursor": ...`
   branches for each supported agent.
2. **Adapter pattern in a dedicated `adapters/` module**: Each agent gets an adapter class that
   knows how to generate that agent's files. The `init` command selects and invokes the adapter.
3. **Plugin-based agents**: Agent support is loaded dynamically from installed Python packages
   that register as `spec-bridge-skill-tool` plugins.
4. **Template-only approach**: All agents share the same raw Markdown templates; no agent-specific
   logic, agents adapt them manually.

---

## Decision

**Option 2**: Adapter pattern in `skill_tool/adapters/`.

Each supported agent has a dedicated adapter module in `skill_tool/adapters/<agent>.py`.
Adapters share a common interface (an abstract base class or Protocol in `adapters/__init__.py`).
The `init` command resolves the correct adapter by name and delegates all agent-specific file
generation to it.

Agent-specific templates live in `adapters/templates/<agent>/` co-located with the adapter code.

---

## Rationale

### Separation of agent-specific logic from core and skills

Adapters are fundamentally different from skills: skills validate SDD artifacts; adapters
generate agent-specific files. Mixing them would violate the single-responsibility principle
and pollute skill modules with agent logic they should not care about.

A dedicated `adapters/` layer is the natural home for agent-specific concerns without
touching core infrastructure or skill modules.

### Open/closed for new agents

Adding support for a new agent (e.g., Windsurf) requires creating one new adapter file.
No existing code is modified. The `init` command's agent selection logic is a simple registry
lookup, not a branching chain that grows with every new agent. This is the open/closed
principle applied concretely.

### Co-location of templates and adapter code

Placing agent templates in `adapters/templates/<agent>/` means all files needed to understand
and modify an agent's integration are in one place. A developer working on the Cursor adapter
does not need to search elsewhere for Cursor-specific templates.

### Option 1 rejected

Hardcoded branches in `init` for each agent create a single large function that grows without
bound. Adding a new agent requires modifying existing, tested code rather than adding new code.

### Option 3 considered and deferred

A plugin architecture would allow third parties to ship agent adapters as separate Python
packages. This is appealing for extensibility but adds significant complexity (entry points,
dynamic discovery, version compatibility) that is not warranted for the current small set of
agents. If the ecosystem grows, a plugin architecture can be introduced as a superseding ADR.

### Option 4 rejected

Shared templates without agent-specific generation logic require the user to manually adapt
templates for each agent. This defeats the purpose of `init` as a zero-configuration bootstrapper.

---

## Consequences

### Positive

- Adding a new agent is a purely additive change: one new adapter file, one new templates
  directory, no modifications to existing code
- Agent-specific logic is fully isolated from skill modules and core
- Adapter interface is testable in isolation; each adapter's output can be snapshot-tested
- Template co-location means agent integration is self-documenting

### Negative

- A shared base class or Protocol must be maintained; as agents diverge in their requirements,
  the common interface may become thin or awkward
- Template duplication across agents: common sections (skill description, workflow steps) appear
  in multiple agent templates without a shared partial mechanism

### Mitigation

Template duplication is managed by keeping templates minimal: they contain only agent-specific
structure, while the canonical skill instruction set is defined in the skill module's
`skill.py`. If template duplication becomes severe, a template inheritance mechanism (e.g.,
Jinja2 blocks) can be introduced within the `adapters/` layer without affecting the adapter
interface.

---

## References

- Constitution: `.spec-bridge/memory/constitution.md` - Architecture section, Skill Module Isolation;
  Code Standards section, SOLID Principles (Open/Closed)
- ADR-001: `0001-spec-bridge-skill-tool-as-separate-binary.md`
- ADR-002: `0002-two-responsibility-model.md`
- ADR-003: `0003-skill-module-isolation.md`
- Feature spec: `specs/042-spec-bridge-commands-as-cursor-skills/spec.md`
- Implementation: `skill-tool/src/skill_tool/adapters/`
