# ADR 0005: spec-bridge.conf as Single Configuration Source

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

`spec-bridge-skill-tool` must adapt to different project layouts. The directory where feature
artifacts are stored, the active schema version, the default git branch, and the VCS type
(git vs. jj) all vary by project. The tool needs a way to discover these values without
hardcoding them.

Options considered:

1. **Environment variables**: Read configuration from `SPEC_BRIDGE_ARTIFACTS_DIR`,
   `SPEC_BRIDGE_SCHEMA_VERSION`, etc.
2. **Single config file (`spec-bridge.conf`)**: A flat key-value file at the project root that
   the tool reads on startup. All defaults apply when the file is absent.
3. **Merge of environment variables + config file**: Environment variables override config file
   values.
4. **YAML config embedded in `pyproject.toml`** under a `[tool.spec-bridge]` section.

---

## Decision

**Option 2**: A single `spec-bridge.conf` file at the project root, with sensible defaults
for every key so the file is optional.

Supported keys:

| Key | Default | Description |
|-----|---------|-------------|
| `artifacts_dir` | `specs/` | Feature artifact directory |
| `schema_version` | `v1` | Active schema version string |
| `templates_dir` | (bundled) | Override path for skill templates |
| `default_branch` | `main` | Base git branch |
| `vcs` | `git` | VCS type: `git` or `jj` |

The file is loaded by `skill_tool.core.config`. When absent, all defaults apply and no error
is raised. The tool must function correctly on a project with no `spec-bridge.conf`.

---

## Rationale

### Single source of truth

A single file eliminates the ambiguity of "which configuration mechanism wins". There is no
precedence logic, no environment-variable override chain to debug, and no hidden state.

### Optionality reduces onboarding friction

A new user running `spec-bridge-skill-tool init` in a blank project should not be required to
create a config file. Defaults cover the common case (git, `specs/`, schema `v1`, `main`
branch). Advanced users who need non-default values opt in by creating the file.

### Project-local configuration belongs in the project root

Placing the config at the project root (not in `~/.config/spec-bridge/` or a similar global
path) ensures configuration is version-controlled alongside the artifacts it governs.
Different clones of the same repo use the same configuration.

### Options 1 and 3 rejected

Environment variables are appropriate for deployment-time secrets (tokens, credentials), not
for project structural configuration. Teams would need to document which variables to set and
ensure they are consistent across developer machines. A file in the repo solves this naturally.
Merging env vars with a config file (Option 3) adds precedence logic that creates subtle bugs
when env vars are set unexpectedly in CI environments.

### Option 4 rejected

`pyproject.toml` belongs to `skill-tool`'s own package metadata. Embedding project-level
user configuration there conflates the tool's packaging metadata with the consuming project's
runtime settings. Projects that do not use Python at all (which is common, since
`spec-bridge-skill-tool` supports polyglot projects) may not have a `pyproject.toml`.

---

## Consequences

### Positive

- Zero setup required for the common case: the tool works out of the box with no config file
- Configuration is version-controlled and identical across all developer machines
- No precedence logic to reason about; one file, one value per key
- Adding a new config key is a one-line change in `core/config.py` plus a schema update

### Negative

- Cannot override config per-invocation without editing the file (no `--config-override` flag)
- All developers on a shared project use the same schema version; upgrading requires explicit
  file edit and project-wide coordination

### Mitigation

The `--schema-version` CLI flag (optional, lower priority than the file) can be added in a
future ADR if per-invocation overrides become necessary. For now, the simplicity of a single
source is more valuable than flexibility.

---

## References

- Constitution: `.spec-bridge/memory/constitution.md` - Architecture section, Configuration Contract
- ADR-001: `0001-spec-bridge-skill-tool-as-separate-binary.md`
- Feature spec: `specs/043-modular-skill-aligned-cli-refactor/spec.md`
- Implementation: `skill-tool/src/skill_tool/core/config.py`
