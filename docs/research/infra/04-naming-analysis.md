# Naming Analysis

> What you call a tool shapes how people think about it. The name encodes scope,
> relationship to existing tools, and the mental model users bring to it.

---

## Naming Dimensions

Before evaluating candidates, establish the dimensions a good name must address:

| Dimension | Question |
|-----------|----------|
| **Scope** | Does the name convey infrastructure / operations / configuration? |
| **Relationship** | Does it signal connection to spec-bridge, or independence? |
| **Mechanism** | Does it hint at how it works (validation, orchestration, reconciliation)? |
| **Domain** | Does it resonate with platform engineers specifically? |
| **Memorability** | Can people say it in conversation without awkwardness? |
| **Googlability** | Is the name unique enough to search for? |
| **CLI ergonomics** | Is the CLI command short enough to type frequently? |

---

## Candidates

### Tier 1: Names that signal "spec-bridge family"

These names position the tool as a sibling or extension of spec-bridge.

#### `spec-bridge-infra`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Good | "infra" is clear |
| Relationship | Strong | Explicit spec-bridge prefix |
| Mechanism | Neutral | "bridge" implies connection but not how |
| Domain | Good | Platform engineers understand "infra" |
| Memorability | Fair | Long, 4 syllables for the suffix alone |
| Googlability | Good | Unique compound |
| CLI | Poor | `spec-bridge-infra-tool` is very long; even `sb-infra` needs alias |

**Best for**: Alternative A (extending spec-bridge). Signals "same family, infra flavor."
**Risk**: If it becomes a separate project, the name implies tighter coupling than exists.

#### `ops-bridge`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Good | "ops" covers infrastructure operations broadly |
| Relationship | Moderate | "-bridge" suffix connects to spec-bridge |
| Mechanism | Neutral | Same as spec-bridge |
| Domain | Good | "ops" is native to platform engineering |
| Memorability | Good | Short, 2 words, easy to say |
| Googlability | Poor | "ops bridge" returns networking/military results |
| CLI | Good | `ops-bridge` is typeable |

**Best for**: Alternative B or C. Signals "operational sibling of spec-bridge."
**Risk**: "Ops" is very broad — could mean monitoring, incident response, deployments.

#### `config-bridge`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Specific | "config" narrows to configuration changes |
| Relationship | Moderate | "-bridge" suffix |
| Mechanism | Neutral | |
| Domain | Fair | Configuration management is one aspect; doesn't convey multi-system |
| Memorability | Good | Short, clear |
| Googlability | Fair | Somewhat generic |
| CLI | Good | `config-bridge` is fine |

**Best for**: Alternative A, if the tool's scope is strictly configuration files.
**Risk**: Undersells the multi-system verification aspect. Sounds like it just validates YAML.

---

### Tier 2: Names that signal "infrastructure lifecycle"

These names position the tool as purpose-built for infrastructure operations.

#### `runbook-bridge`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Excellent | "runbook" is the operations term for procedural guides |
| Relationship | Moderate | "-bridge" suffix |
| Mechanism | Good | Runbooks imply phased, verifiable procedures |
| Domain | Excellent | Platform engineers think in runbooks |
| Memorability | Good | Two clear words |
| Googlability | Good | Unique compound |
| CLI | Good | `runbook-bridge` or `rb` |

**Best for**: Alternative B. The "runbook" metaphor is strong — the RFC is the runbook,
the tool ensures you follow it and verify each step.
**Risk**: "Runbook" implies reactive operations (incident response). Infrastructure
changes are proactive. Some may find the connotation misleading.

#### `infra-spec`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Good | "infra" + "spec" |
| Relationship | Moderate | "spec" echoes spec-bridge without the "-bridge" suffix |
| Mechanism | Fair | "spec" implies specification, not verification |
| Domain | Good | |
| Memorability | Good | Short |
| Googlability | Poor | Too generic, conflicts with infrastructure-as-code tools |
| CLI | Good | `infra-spec` is clean |

**Best for**: Any alternative. Generic enough to fit.
**Risk**: Sounds like a specification format, not a tool. "infra-spec validate" reads
like "validate an infra spec" rather than "verify infrastructure matches a spec."

#### `plat-bridge`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Good | "plat" (platform) narrows to platform engineering |
| Relationship | Strong | "-bridge" suffix |
| Mechanism | Neutral | |
| Domain | Excellent | Direct reference to platform team's domain |
| Memorability | Good | Short |
| Googlability | Good | Unique |
| CLI | Good | `plat-bridge` is typeable |

**Best for**: Teams where "platform" is the identity.
**Risk**: Too team-specific. If other teams adopt it, the "plat" prefix feels parochial.

---

### Tier 3: Names that signal the mechanism

These names describe what the tool *does* rather than what domain it serves.

#### `rfc-engine`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Narrow | Specifically RFCs |
| Relationship | Weak | No "bridge" or "spec" reference |
| Mechanism | Excellent | "engine" implies a driver/controller |
| Domain | Good | RFCs are the input, and the team uses them |
| Memorability | Good | |
| Googlability | Fair | "RFC engine" has some noise |
| CLI | Good | `rfc-engine` |

**Best for**: Alternative C. The RFC is the program, the engine executes it.
**Risk**: Implies the tool is only for RFC-originated work. What about ad-hoc
infrastructure changes that don't warrant a full RFC?

#### `phase-runner`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Neutral | Phases are generic |
| Relationship | Weak | No spec-bridge connection |
| Mechanism | Good | "runner" implies execution |
| Domain | Fair | "Phase" is meaningful but generic |
| Memorability | Good | |
| Googlability | Good | Unique |
| CLI | Good | `phase-runner` |

**Best for**: Alternative C. Emphasizes the phased execution model.
**Risk**: Sounds like a test runner or CI runner. Too generic.

#### `gate-keeper` / `gatectl`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Neutral | Gates are generic |
| Relationship | Weak | |
| Mechanism | Excellent | Directly describes the gate-based verification model |
| Domain | Good | "Gating" is familiar in CI/CD |
| Memorability | Excellent | Strong metaphor |
| Googlability | Poor | "gatekeeper" is heavily used (OPA Gatekeeper, etc.) |
| CLI | Fair | `gatectl` is okay; `gate-keeper` has a hyphen |

**Best for**: Alternative C. The gate metaphor is the core abstraction.
**Risk**: OPA Gatekeeper confusion is real. `gatectl` avoids it but loses the metaphor.

---

### Tier 4: Names that signal the relationship to infrastructure-as-code

#### `terraform-bridge` / `iac-bridge`

Not recommended. Too narrow (not all infra changes are Terraform) or too jargon-heavy
(IaC is insider terminology).

#### `drift-bridge`

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope | Narrow | "drift" implies detection, not implementation |
| Relationship | Moderate | "-bridge" |
| Mechanism | Good | Drift detection is one verification mode |
| Domain | Good | Platform engineers fight drift |
| Memorability | Good | |
| Googlability | Fair | |
| CLI | Good | `drift-bridge` |

**Best for**: If the primary value prop is "verify no drift from RFC."
**Risk**: Drift detection is a subset of what the tool does. The tool also *drives*
changes, not just detects deviations.

---

## Recommendation Matrix

| Name | Alt A | Alt B | Alt C | Alt D | Overall fit |
|------|-------|-------|-------|-------|-------------|
| `spec-bridge-infra` | Best | Poor | Poor | Good | Only if extending spec-bridge |
| `ops-bridge` | Good | Good | Fair | Best | Safe, generic, "spec-bridge for ops" |
| `config-bridge` | Fair | Fair | Poor | Fair | Too narrow |
| `runbook-bridge` | Fair | Best | Good | Good | Strong metaphor for procedural infra |
| `infra-spec` | Fair | Fair | Fair | Fair | Too generic |
| `plat-bridge` | Good | Good | Good | Good | Team-specific |
| `rfc-engine` | Poor | Fair | Best | Poor | Only if RFC-first controller |
| `phase-runner` | Poor | Fair | Good | Poor | Too generic |
| `gatectl` | Poor | Poor | Good | Poor | Mechanism-specific |
| `drift-bridge` | Poor | Fair | Fair | Poor | Too narrow |

## Top 3 Recommendations

1. **`ops-bridge`** — Works for all alternatives, best fit for Alternative D.
   Signals "spec-bridge's operational sibling" — same philosophy (tool validates,
   agent orchestrates), different domain. CLI: `ops-bridge`.

2. **`runbook-bridge`** — Works for Alternatives B, C, and D. Strong domain resonance.
   The "runbook" metaphor captures phased, verified infrastructure procedures.
   CLI: `runbook-bridge` or alias `rb`.

3. **`spec-bridge-infra`** — Only if choosing Alternative A or D-as-extension. Makes
   the family relationship explicit. CLI: `sb-infra` (alias required).

The final choice depends on which alternative is selected. The name should reinforce
the chosen architecture's mental model, not fight it.

For Alternative D specifically, **`ops-bridge`** is the strongest choice because:
- "ops" conveys the domain without over-specifying the mechanism
- "-bridge" connects it to spec-bridge as a sibling tool
- It doesn't imply a controller or engine (which D explicitly isn't)
- It's short enough for daily CLI use
