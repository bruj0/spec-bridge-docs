# ADR 0004: Schema-First Artifact Design: YAML Schemas to Pydantic Models

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

`spec-bridge-skill-tool` validates the YAML frontmatter of SDD artifacts produced by AI agents.
To perform this validation, it needs a description of what each artifact's frontmatter must
contain: required fields, types, allowed values, and constraints.

There are several ways to encode this description:

1. **Hardcoded Pydantic models**: Define `class SpecFrontmatter(BaseModel)` directly in Python
   source code for each artifact type.
2. **Schema YAML files -> runtime Pydantic derivation**: Store schema definitions as YAML files;
   derive Pydantic models from them at runtime. Skills reference schemas by version string only.
3. **JSON Schema**: Store schemas as JSON Schema files; validate directly without Pydantic.
4. **Per-skill ad-hoc validation**: Each skill writes its own validation logic without a shared
   schema format.

---

## Decision

**Option 2**: Schema-first with runtime Pydantic model derivation.

Schema files are YAML, stored in `init_cmd/schemas/<version>/` within the `skill-tool` package.
The active schema version is resolved from `spec-bridge.conf` (`schema_version` key, default `v1`).
Skills reference schemas by version string only -- full path resolution is handled by
`skill_tool.core.schema`.

`core/schema.py` loads the YAML schema file and derives a Pydantic model from it at runtime.
Skill modules call `core.schema.load_model(artifact_type, version)` and receive a ready-to-use
Pydantic model class. No skill module hardcodes field names or types.

Changing an artifact's frontmatter structure requires:
1. Updating the schema YAML first.
2. Updating the skill module and template.
3. Updating tests.

---

## Rationale

### Schema as the single source of truth

With hardcoded Pydantic models (Option 1), the artifact format is defined in Python code that
lives inside `skill_tool`. To change a field name, a developer edits Python -- and must remember
to update the corresponding YAML template and documentation separately. With Option 2, the YAML
schema is the canonical definition; the Pydantic model and documentation are derived from it.
There is one place to change, one place to review.

### Version-addressed schemas enable safe evolution

Encoding the schema version in `spec-bridge.conf` means projects can pin to `v1` while the tool
ships `v2` schemas. Old projects continue to validate against the version they were initialized
with. New projects opt in to `v2` via config. No forced migrations.

### Runtime derivation keeps skill modules thin

Skills do not need to import or maintain Pydantic model classes. They call `core.schema.load_model`
and receive a model. This keeps skill modules focused on outcome verification logic, not type
bookkeeping.

### Option 1 rejected

Hardcoded models scatter the schema definition across Python files. When an artifact's frontmatter
needs a new required field, the developer must update the model, the template, and any
documentation -- with no single authoritative source tying them together.

### Option 3 (JSON Schema) considered

JSON Schema validation is powerful but verbose and requires a separate validation library.
Deriving Pydantic models from YAML is simpler, keeps error messages in the Pydantic style the
codebase already uses, and integrates naturally with Python 3.11+ type annotations.

### Option 4 rejected

Ad-hoc per-skill validation makes it impossible to enforce consistent field naming and types
across all artifacts. It also means each skill reinvents the validation wheel.

---

## Consequences

### Positive

- One YAML file per artifact type is the single source of truth for its structure
- Schema versioning enables safe, backward-compatible artifact format evolution
- Skill modules are thin: validation logic is in the schema, not in Python class definitions
- Adding a new required field to an artifact is a one-line YAML change, automatically picked
  up by all skills that validate that artifact type
- Schema files can be read by humans and tools outside the Python ecosystem

### Negative

- Runtime Pydantic model derivation adds startup latency (benchmarked to stay within the
  < 2 second tool invocation budget)
- Schema YAML syntax must be kept simple enough for `core/schema.py` to reliably derive
  Pydantic models; highly complex union types or discriminated unions may be difficult to encode

### Mitigation

Schema loading is cached within a single tool invocation (no repeated file reads). The YAML
schema format is documented in `init_cmd/schemas/README.md` with examples covering all supported
field types.

---

## References

- Constitution: `.spec-bridge/memory/constitution.md` - Architecture section, Schema Contract
- ADR-002: `0002-two-responsibility-model.md`
- ADR-003: `0003-skill-module-isolation.md`
- Feature spec: `specs/043-modular-skill-aligned-cli-refactor/spec.md`
- Implementation: `skill-tool/src/skill_tool/core/schema.py`
- Schema files: `skill-tool/src/skill_tool/init_cmd/schemas/v1/`
