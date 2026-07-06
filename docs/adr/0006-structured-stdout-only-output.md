# ADR 0006: Structured Stdout-Only Output

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: Platform team

---

## Context

`spec-bridge-skill-tool` is invoked by AI agents, not interactive developers. The agent reads
the tool's output and uses it to decide whether to proceed, retry, or surface an error to the
user. The output format must be machine-parseable, unambiguous about success vs. failure, and
consistent across all skills and error conditions.

Several output conventions are common in CLI tools:

1. **stderr for errors, stdout for success data**: Standard Unix convention.
2. **Structured JSON to stdout, nothing to stderr**: Single output stream, machine-readable.
3. **Rich formatted text (colors, tables) to stdout**: Human-readable, not machine-parseable.
4. **Separate error files written to disk**: Persistent error log alongside artifact files.
5. **Structured human-readable text to stdout only**: Single stream, readable by both agents
   and humans, no JSON parsing required.

---

## Decision

**Option 5**: Structured human-readable text to stdout only.

All tool output -- success, failure, schema violations, outcome verification results -- goes
to stdout. No output is written to stderr. No error files are created on disk.

Every output message includes:
- Exit code context (implicit from process exit code)
- Skill name
- Validation step (`schema` | `outcome`)
- Human-readable description of the result or violation

`core/logging.py` provides the single logging interface for all skill and core code. Direct
use of `print()` in skill or core modules is prohibited.

Exit codes: `0` = all checks passed, non-zero = at least one check failed.

---

## Rationale

### AI agents read stdout

AI agents executing skill instruction sets capture tool output from stdout. Splitting errors to
stderr requires the agent instruction set to capture and merge two streams, adding complexity
to every skill file. A single stdout stream eliminates this complexity.

### No error files avoids side effects

A validation harness that writes error files to disk is no longer purely a verifier -- it becomes
a file-generating tool with side effects outside the artifact directory. This violates the
two-responsibility model (ADR-002). Error files also accumulate silently and can be mistaken
for artifact files.

### Human-readable output over JSON

Pure JSON output (Option 2) is maximally machine-parseable but unreadable when a developer
inspects tool output directly. Pure rich-formatted text (Option 3) is unreadable by agents
without stripping ANSI codes. Structured human-readable text is a deliberate middle ground:
a developer can read it, and an agent can parse key signals (pass/fail, skill name, violation
description) from well-formatted plain text without a JSON parser.

### stderr convention rejected for this use case

The stderr/stdout split (Option 1) is designed for interactive shell pipelines where stdout
carries data and stderr carries diagnostics. `spec-bridge-skill-tool` does not produce
stream-pipeable data -- it produces a verdict. The verdict and its explanation belong together
on one stream.

---

## Consequences

### Positive

- Skill instruction files capture tool output with a single `$(spec-bridge-skill-tool <skill>)`
  call; no stream merging required
- Output is readable by both AI agents and human developers without post-processing
- No disk side effects beyond the artifact directory: the tool is fully read-only post-`init`
- Consistent output format across all skills makes agent instruction sets easier to write
- Exit code provides an unambiguous pass/fail signal without parsing output

### Negative

- Structured human-readable text is less trivially parseable than JSON for automated tooling
  that wants to extract specific fields (e.g., which fields failed schema validation)
- Developers accustomed to stderr for errors may find it unexpected that all output is on stdout

### Mitigation

If machine-parseable output becomes necessary for external tooling, a `--json` flag can be
added to emit JSON to stdout alongside the human-readable default. This is a backward-compatible
change that does not require amending this ADR.

---

## References

- Constitution: `.spec-bridge/memory/constitution.md` - Architecture section, Output Contract;
  Code Standards section, Logging
- ADR-002: `0002-two-responsibility-model.md`
- Feature spec: `specs/043-modular-skill-aligned-cli-refactor/spec.md`
- Implementation: `skill-tool/src/skill_tool/core/logging.py`, `skill-tool/src/skill_tool/core/output.py`
