# Alternative A: Extend spec-bridge-v2 with Infrastructure Skills

> **Approach**: Add infrastructure-aware skills, multi-repo support, and live verification
> to the existing spec-bridge-v2 harness.
> **Working name**: "spec-bridge-infra" (skills deployed as `spec-bridge-infra-*`)

---

## Core Idea

spec-bridge-v2 already provides the instruction-skill-validate loop. This alternative
extends it rather than replacing it:

1. Add new **infra-specific skills** alongside the existing SDD skills
2. Add **multi-repo awareness** to `ProjectConfig` and the dispatch pipeline
3. Add **live verification** as a new check type (system probes, not just file checks)
4. Reuse the same `spec-bridge-skill-tool` binary with new subcommands

The RFC becomes the `spec.md` equivalent — the source of truth that the plan is
derived from. Phases become the equivalent of work packages. Each phase targets
one or more repositories and includes verification steps that query live systems.

---

## Architecture

```
spec-bridge-v2/
├── skill-tool/src/skill_tool/
│   ├── skills/
│   │   ├── specify/          # existing
│   │   ├── plan/             # existing
│   │   ├── tasks/            # existing
│   │   ├── ...
│   │   ├── infra-rfc/        # NEW — RFC ingestion + phase decomposition
│   │   ├── infra-plan/       # NEW — multi-repo phase planning
│   │   ├── infra-implement/  # NEW — per-system config changes
│   │   ├── infra-verify/     # NEW — live system verification
│   │   └── infra-decommission/ # NEW — cleanup + rollback verification
│   ├── core/
│   │   ├── dispatch.py       # extended with multi-repo context
│   │   ├── probes.py         # NEW — live system probe framework
│   │   └── multi_repo.py     # NEW — cross-repo coordination
│   └── adapters/templates/
│       ├── infra-rfc.md      # NEW
│       ├── infra-plan.md     # NEW
│       └── ...
```

### New Concepts

#### System Manifest (`systems.yaml`)

Declares the systems involved in an infrastructure change and how to reach them:

```yaml
systems:
  bf-container-base-images:
    type: git-repo
    url: git@gitlab.com:bridgefund/bf-container-base-images.git
    artifacts: [Dockerfile, .gitlab-ci.yml]

  ci-templates:
    type: git-repo
    url: git@gitlab.com:bridgefund/ci-templates.git
    artifacts: ["v3-modern/modules/**/*.yml"]

  dev-cluster:
    type: kubernetes
    context: arn:aws:eks:eu-central-1:002665144501:cluster/bridgefund-development
    namespaces: [gitlab-runner, kube-system]

  bf-terraform:
    type: terraform
    url: git@gitlab.com:bridgefund/bf-terraform.git
    state_backend: s3
    workspaces: [development]
```

#### Phase Model (replaces Work Packages for infra)

Each phase targets one or more systems and has:
- `depends_on`: phases that must complete first
- `systems`: which systems this phase touches
- `changes`: what configuration files change
- `verify`: probes that confirm the phase succeeded

```yaml
---
phase_id: P01
title: "Add Podman to bf-runner-allinone"
lane: planned
depends_on: []
systems: [bf-container-base-images]
changes:
  - file: bf-runner-allinone/Dockerfile
    type: modify
    description: "Add podman, buildah, fuse-overlayfs packages"
  - file: bf-runner-allinone/containers.conf
    type: create
    description: "Rootless container engine config"
verify:
  - type: ci-pipeline
    repo: bf-container-base-images
    job: build-runner
    expect: success
  - type: shell
    command: "podman --version"
    context: runner-pod
    expect: "podman version 5"
history: []
---
```

#### Probe Framework

Probes are the verification layer — they query live systems and return structured
pass/fail results. Each probe type maps to a system type:

| Probe type | System type | What it checks | Example |
|-----------|-------------|----------------|---------|
| `kubectl` | kubernetes | Resource existence, status, labels | `kubectl get deploy -n gitlab-runner -o json` |
| `terraform-plan` | terraform | Planned changes match expectations | `terraform plan -detailed-exitcode` |
| `ci-pipeline` | git-repo | Pipeline job succeeded | GitLab API: `GET /projects/:id/pipelines/:id/jobs` |
| `shell` | any | Arbitrary command exit code + output | `aws ecr describe-repositories` |
| `http` | any | Endpoint responds with expected status | `curl -s -o /dev/null -w '%{http_code}'` |

Probes are declared in phase YAML and executed by `infra-verify`:

```python
class ProbeResult(TypedDict):
    probe_type: str
    target: str
    passed: bool
    actual: str
    expected: str
    timestamp: str
```

---

## Lifecycle

```
RFC (input) → infra-rfc (ingest + validate)
           → infra-plan (phases + systems manifest)
           → infra-implement P01 (config changes in target repo)
           → infra-verify P01 (live probes)
           → infra-implement P02 ...
           → infra-verify P02 ...
           → ...
           → infra-decommission (cleanup verification)
```

### Skill: `infra-rfc`

**Input**: An RFC document (markdown file or Notion page URL).
**Output**: `infra-spec.md` in the feature directory — a normalized RFC with
frontmatter fields (`systems`, `phases_count`, `status`).

Validation checks:
- RFC has Summary, Problem Statement, Proposed Solution, Implementation Plan sections
- Systems affected are enumerated
- Phases are identifiable in the implementation plan
- Goals and non-goals are stated

### Skill: `infra-plan`

**Input**: `infra-spec.md` (from `infra-rfc`).
**Output**: `infra-plan.md` + `systems.yaml` + `phases/P01-*.md`, `phases/P02-*.md`, ...

The agent decomposes the RFC's implementation plan into ordered phases, each
targeting specific systems. The plan includes:
- Dependency graph between phases
- Per-phase verification criteria
- Rollback strategy per phase
- Systems manifest declaring all targets

Validation checks:
- Every system referenced in a phase exists in `systems.yaml`
- Phase dependencies form a DAG (no cycles)
- Every phase has at least one verify probe
- Rollback is documented for phases that modify live systems

### Skill: `infra-implement`

**Input**: A phase file (`phases/Pxx-*.md`).
**Output**: Configuration changes in the target repository/system.

This skill operates differently from spec-bridge's `implement`:
- Instead of creating a worktree in the same repo, it may need to **clone or
  reference another repository** and make changes there.
- The changes are configuration files (HCL, YAML, Helm values), not source code.
- The "implement summary" includes which files changed in which repos.

Validation checks:
- Phase lane is `doing` (transition from `planned`)
- All dependency phases are in lane `done`
- Target repository is accessible
- Changed files parse correctly (HCL validates, YAML parses, Helm templates render)

### Skill: `infra-verify`

**Input**: A phase file (`phases/Pxx-*.md`) with `verify` probes defined.
**Output**: `phases/Pxx-verify-results.json` with probe outcomes.

The agent (or tool) executes each probe and records the result. If all probes
pass, the phase transitions to `done`. If any fail, the phase stays in `doing`
with error details.

Validation checks:
- All probes in the phase definition were executed
- Probe results are recorded in the JSON sidecar
- All probes passed (or explicit waivers are documented)

### Skill: `infra-decommission`

**Input**: The full plan with all phases `done`.
**Output**: Decommission verification results.

Validates the cleanup side of the migration: old resources removed, old node
groups decommissioned, old configurations deleted.

---

## What Transfers from spec-bridge-v2

| spec-bridge concept | Infra equivalent | Transfer effort |
|--------------------|-----------------|-----------------|
| `spec.md` | `infra-spec.md` (normalized RFC) | Schema + template |
| `plan.md` | `infra-plan.md` + `systems.yaml` | New schema, reuse plan skill pattern |
| Work packages | Phases | Similar lane model, different scope |
| Worktrees | Multi-repo clones/references | Significant new machinery |
| Schema validation | Schema validation + probe results | Extended, not replaced |
| `spec-bridge-skill-tool` CLI | Same binary, new subcommands | Shared dispatch pipeline |
| Session logging | Same session logging | Direct reuse |
| YAML frontmatter | Same frontmatter pattern | Direct reuse |

## Trade-offs

### Advantages

- **Shared infrastructure**: One binary, one dispatch pipeline, one logging system.
  Teams that use both SDD and infra harness learn one tool.
- **Proven patterns**: Lane model, session management, frontmatter schemas, and the
  instruction-validate loop are battle-tested.
- **Incremental investment**: Each new skill is additive. The existing SDD skills
  are unaffected.
- **Single `init`**: One `spec-bridge-skill-tool init` deploys both SDD and infra skills.

### Disadvantages

- **Scope creep risk**: spec-bridge-v2 is already complex (12 skills, 3 workflows).
  Adding 5 more infra skills plus multi-repo and probe machinery could make the
  codebase harder to maintain.
- **Conceptual mismatch**: spec-bridge's core assumption is "one repo, one workspace."
  Multi-repo coordination is a fundamentally different problem that may not fit
  cleanly into the existing `ProjectConfig` / `feature_dir` model.
- **Probe execution is a new domain**: Running `kubectl`, `terraform plan`, and
  GitLab API calls from a validation tool is architecturally different from checking
  file existence and YAML schemas. It introduces network dependencies, credentials,
  timeouts, and flakiness that spec-bridge currently avoids.
- **Shared release cycle**: A breaking change to spec-bridge core (dispatch, config,
  schemas) affects both SDD and infra users. Separate tools can evolve independently.
- **Binary size and dependencies**: Probes may require SDKs (boto3, kubernetes client)
  that SDD users don't need. Either the binary grows or optional deps add complexity.

### Risk: "Two Products in a Trenchcoat"

The biggest risk is that the infra skills share a binary but share no meaningful
abstraction. If `infra-verify` has nothing in common with `specify` beyond the
dispatch pipeline, the coupling is accidental rather than essential. This is the
hallmark of a monolith that should have been two services.

**Mitigation**: Define a clear boundary. If the shared surface is only dispatch +
logging + frontmatter, those can be extracted into a shared library that both
tools depend on.
