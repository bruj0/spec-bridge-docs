# Alternative B: Purpose-Built Infrastructure Harness

> **Approach**: A standalone tool designed from scratch for multi-system infrastructure
> operations, sharing principles with spec-bridge but not code.
> **Working name**: "runbook-bridge" or "infra-bridge"

---

## Core Idea

Infrastructure operations are fundamentally different from software development in
three ways that justify a purpose-built tool:

1. **Multi-system by default**. There is no "workspace." The unit of work is a
   cross-cutting change that touches N repositories and M live systems. The tool
   must be multi-repo-native, not multi-repo-as-extension.

2. **Verification requires system access**. A spec-bridge check reads files on disk.
   An infra check runs `terraform plan`, queries a Kubernetes API, or calls an AWS
   endpoint. The verification engine is fundamentally different — it deals with
   credentials, network, timeouts, idempotency, and eventual consistency.

3. **The RFC is the spec**. Infrastructure changes are already documented in RFCs with
   a well-understood structure (Summary, Problem, Solution, Phases, Alternatives,
   Risks). There's no need to re-specify — the RFC *is* the specification. The tool
   should ingest it directly.

Rather than extending spec-bridge with features that strain its assumptions, build
a new tool that borrows spec-bridge's *principles* (instruction-driven, deterministic
verification, structured artifacts, progressive disclosure) while making different
*architectural choices* (multi-repo-native, probe-based verification, RFC-first).

---

## Architecture

```
runbook-bridge/
├── src/runbook_bridge/
│   ├── __main__.py          # CLI entrypoint
│   ├── config.py            # Project config (runbook-bridge.yaml)
│   │
│   ├── core/
│   │   ├── dispatch.py      # Skill dispatch (borrowed pattern)
│   │   ├── output.py        # JSON verdict output
│   │   ├── logging.py       # Session + audit logging
│   │   └── dag.py           # Phase dependency DAG solver
│   │
│   ├── rfc/
│   │   ├── parser.py        # RFC markdown → structured model
│   │   ├── notion.py        # Notion RFC page → structured model
│   │   └── schema.py        # RFC validation schemas
│   │
│   ├── systems/
│   │   ├── protocol.py      # SystemTarget Protocol
│   │   ├── git_repo.py      # Git repository target
│   │   ├── kubernetes.py    # Kubernetes cluster target
│   │   ├── terraform.py     # Terraform workspace target
│   │   ├── ci_pipeline.py   # CI/CD system target
│   │   └── cloud.py         # Cloud provider target (AWS, etc.)
│   │
│   ├── probes/
│   │   ├── protocol.py      # Probe Protocol
│   │   ├── kubectl.py       # Kubernetes probes
│   │   ├── terraform.py     # Terraform plan probes
│   │   ├── shell.py         # Arbitrary shell command probes
│   │   ├── http.py          # HTTP endpoint probes
│   │   ├── git.py           # Git state probes (branch exists, file changed)
│   │   └── registry.py      # ProbeRegistry — discover + run probes
│   │
│   ├── skills/
│   │   ├── ingest/          # RFC → normalized infra-spec
│   │   ├── plan/            # infra-spec → phases + systems manifest
│   │   ├── implement/       # Execute config changes per phase
│   │   ├── verify/          # Run probes per phase
│   │   └── decommission/    # Cleanup verification
│   │
│   └── adapters/
│       ├── cursor.py        # Generate .cursor/skills/ instruction files
│       └── templates/       # SKILL.md templates per skill
│
├── schemas/
│   └── v1/
│       ├── infra-spec.yaml
│       ├── phase.yaml
│       ├── systems.yaml
│       └── probe-result.yaml
│
└── runbook-bridge.yaml      # Project-level config
```

### Key Abstractions

#### `SystemTarget` Protocol

Every external system the harness can interact with implements this protocol:

```python
class SystemTarget(Protocol):
    system_id: str
    system_type: str  # "git-repo", "kubernetes", "terraform", "ci-pipeline"

    def is_reachable(self) -> ProbeResult:
        """Pre-flight: can we talk to this system?"""
        ...

    def describe_state(self) -> dict:
        """Snapshot current state for audit log."""
        ...

    def available_probes(self) -> list[str]:
        """Which probe types work for this system?"""
        ...
```

#### `Probe` Protocol

Probes are the verification primitives:

```python
class Probe(Protocol):
    probe_id: str
    probe_type: str
    target_system: str

    def execute(self, context: ProbeContext) -> ProbeResult:
        """Run the probe and return a structured result."""
        ...

    def dry_run(self, context: ProbeContext) -> ProbeResult:
        """Describe what would be checked without executing."""
        ...
```

#### Phase DAG

Phases form a directed acyclic graph. The DAG solver determines execution order,
identifies parallelizable phases, and detects cycles:

```python
class PhaseDAG:
    def execution_order(self) -> list[list[str]]:
        """Return phases grouped by parallel execution level."""
        # [[P01], [P02, P03], [P04], [P05, P06]]
        ...

    def is_ready(self, phase_id: str) -> bool:
        """All dependencies of this phase are in lane 'done'."""
        ...

    def critical_path(self) -> list[str]:
        """Longest dependency chain (for time estimates)."""
        ...
```

---

## Configuration: `runbook-bridge.yaml`

```yaml
version: v1
target_branch: main
artifacts_dir: infra-specs/    # where specs and phases live
vcs: git

# Multi-repo: declare all repositories this project touches
repositories:
  bf-container-base-images:
    url: git@gitlab.com:bridgefund/bf-container-base-images.git
    local_path: ~/projects/bf-container-base-images  # optional: if already cloned
    branch_prefix: infra/                            # branches created by the tool

  ci-templates:
    url: git@gitlab.com:bridgefund/ci-templates.git
    branch_prefix: infra/

  gitops-delivery-v1:
    url: git@gitlab.com:bridgefund/gitops-delivery-v1.git
    branch_prefix: infra/

  bf-terraform:
    url: git@gitlab.com:bridgefund/bf-terraform.git
    branch_prefix: infra/

# System access configuration
systems:
  dev-cluster:
    type: kubernetes
    context: arn:aws:eks:eu-central-1:002665144501:cluster/bridgefund-development

  aws-account:
    type: cloud
    provider: aws
    region: eu-central-1
    profile: bridgefund-dev

  gitlab:
    type: ci-pipeline
    provider: gitlab
    base_url: https://gitlab.com
    # Token from environment: GITLAB_TOKEN
```

---

## Lifecycle

```
         ┌──────────────┐
         │  RFC Document │   (markdown file or Notion URL)
         └──────┬───────┘
                │
         ┌──────▼───────┐
         │   ingest      │   Parse RFC → infra-spec.md + systems.yaml
         └──────┬───────┘
                │
         ┌──────▼───────┐
         │    plan       │   Phases + dependency DAG + verify criteria
         └──────┬───────┘
                │
         ┌──────▼───────┐
    ┌───►│  implement    │   Config changes in target repo(s) per phase
    │    │   phase Pxx   │
    │    └──────┬───────┘
    │           │
    │    ┌──────▼───────┐
    │    │   verify      │   Run probes → all pass?
    │    │   phase Pxx   │
    │    └──────┬───────┘
    │           │
    │      ┌────▼────┐
    │      │ passed?  │
    │      └────┬────┘
    │       no  │  yes
    │    ┌──────┘  └──────┐
    │    │ fix + re-verify │   Pxx.lane = done
    │    └────────────────┘   → next phase
    │           │
    └───────────┘    (repeat for each phase in DAG order)
                │
         ┌──────▼───────┐
         │ decommission  │   Verify old resources removed
         └──────┬───────┘
                │
         ┌──────▼───────┐
         │    report     │   Execution report + audit trail
         └──────────────┘
```

### Skill: `ingest`

**Input**: RFC file path or Notion URL.
**Output**: `infra-spec.md` (normalized, with frontmatter).

The ingest skill parses the RFC and extracts:
- Systems affected (from "Affects" field or Impact Analysis section)
- Phases (from Implementation Plan section)
- Verification criteria (from Success Metrics section)
- Risks (from Risks section)

For Notion RFCs, it uses the Notion API (or MCP) to fetch the page content,
then normalizes to the same markdown format.

Validation:
- RFC sections are present and non-empty
- At least one system is identified
- At least one phase is identifiable
- Success metrics exist

### Skill: `plan`

**Input**: `infra-spec.md`.
**Output**: `infra-plan.md` + `systems.yaml` + `phases/Pxx-*.md`.

The agent (guided by the skill) creates:
1. A systems manifest declaring all targets
2. One phase file per implementation step
3. A dependency graph (phases reference each other via `depends_on`)
4. Verification probes for each phase

Validation:
- Systems in phase files exist in `systems.yaml`
- Phase dependencies form a DAG
- Every phase has at least one probe
- Every system in `systems.yaml` is targeted by at least one phase

### Skill: `implement`

**Input**: A phase file.
**Output**: Configuration changes committed to branches in target repos.

Unlike spec-bridge's implement (which works in a worktree of the same repo),
infra-implement:
1. Checks out the target repository (or locates the local clone)
2. Creates a branch with a consistent naming prefix
3. Makes the configuration changes described in the phase
4. Commits with a message referencing the RFC and phase
5. Optionally pushes and creates an MR

Validation:
- Phase is in lane `doing`
- Dependency phases are all `done`
- Target repos are accessible
- Changes parse correctly (HCL: `terraform fmt -check`, YAML: parse, Helm: `helm template`)

### Skill: `verify`

**Input**: A phase file with probes defined.
**Output**: `phases/Pxx-verify-results.json`.

Executes each probe and records structured results.

Modes:
- `--dry-run`: Describe probes without executing (good for plan review)
- `--live`: Execute probes against actual systems
- `--retry N`: Re-run failed probes up to N times (for eventually-consistent systems)

Validation:
- All probes executed
- All probes passed (or waivers documented)
- Probe results recorded

### Skill: `decommission`

**Input**: Full plan with all phases `done`.
**Output**: `decommission-results.json`.

Runs cleanup probes:
- Old Kubernetes resources are gone
- Old Terraform resources are removed
- Old CI templates are no longer referenced
- Old node groups are decommissioned

---

## What It Borrows from spec-bridge-v2

| Principle | How it manifests |
|----------|-----------------|
| Instruction-driven | SKILL.md files guide any LLM agent |
| Deterministic verdict | JSON pass/fail on stdout, exit 0/1 |
| YAML frontmatter | Phase files use frontmatter for machine-readable metadata |
| Lane model | Phases have lanes: `planned → doing → done` |
| Session management | `session_id` for audit logging |
| Progressive disclosure | Simple RFCs = fewer phases; complex = more |
| Schema validation | Phase, system, and probe result schemas |

| What it does NOT borrow | Why |
|------------------------|-----|
| `spec.md` specify flow | RFC is the spec — no need to re-specify |
| Single-repo assumption | Multi-repo is fundamental, not bolted on |
| File-only verification | Probes query live systems |
| Worktree model | Cross-repo branches instead of worktrees |
| Decompose/misfit analysis | RFCs already describe the architecture |

---

## Trade-offs

### Advantages

- **Clean slate for multi-repo**: No legacy single-repo assumptions to work around.
  Multi-repo is a first-class concept in the config, the DAG, and the verification.
- **Purpose-built probe system**: Probes are the core abstraction, not an afterthought.
  Each system type has dedicated probe implementations with proper error handling,
  retries, and dry-run support.
- **Independent evolution**: Infra harness and spec-bridge can evolve at different
  speeds. A breaking change to spec-bridge doesn't affect infra users, and vice versa.
- **RFC-native**: No translation layer from "how we write RFCs" to "what the tool
  expects." The RFC format the team already uses is the input.
- **Smaller surface per tool**: Each tool has a focused responsibility. Easier to
  onboard, easier to audit, easier to test.

### Disadvantages

- **Duplicated infrastructure**: Dispatch pipeline, session logging, frontmatter
  parsing, output formatting — all reimplemented. This is a real cost, even if the
  code is simpler per-tool.
- **Two tools to learn**: Teams using both SDD and infra operations need to know
  `spec-bridge-skill-tool` and `runbook-bridge`. Different CLIs, different configs,
  different skill naming conventions.
- **No shared validation language**: A bug in the frontmatter parser is fixed in one
  tool but not the other. Schema evolution diverges over time.
- **New project bootstrap cost**: Repository setup, CI, testing, documentation,
  packaging — all from scratch. spec-bridge-v2 already has all of this.
- **Risk of drift**: Without shared code, the two tools may diverge in patterns
  and conventions, making it harder for contributors who work on both.

### Risk: Greenfield Temptation

Starting a new project is appealing because every decision is fresh. But most of the
complexity in the infra harness is in the *probe execution engine* and the *multi-repo
coordination*, not in the dispatch pipeline. If 60% of the code is shared concerns
(CLI, config, logging, frontmatter, output), building a new project means writing that
60% twice.

**Mitigation**: Extract shared concerns into a `spec-bridge-core` library that both
tools depend on. But this creates a third project to maintain — the worst of both worlds
unless the shared surface is genuinely stable.

---

## Dependency Trade-off

spec-bridge-v2 currently has zero runtime dependencies (stdlib only for the
skill-tool, plus Pydantic). A standalone infra harness would need:

| Capability | Dependency | Required? |
|-----------|-----------|-----------|
| YAML frontmatter | stdlib `re` + manual parse (current pattern) | No new dep |
| Kubernetes probes | `kubernetes` client library | Yes for k8s probes |
| AWS probes | `boto3` | Yes for AWS probes |
| Terraform probes | `subprocess` (shell out to `terraform`) | No new dep |
| GitLab API | `requests` or `httpx` | Yes for CI probes |
| Notion API | MCP or `requests` | Optional |

This means the infra harness would have **real dependencies**, unlike spec-bridge.
The zero-dependency principle doesn't transfer to a tool that must talk to live systems.

An alternative: **all probes shell out** to installed CLIs (`kubectl`, `terraform`,
`aws`, `glab`). This preserves zero Python dependencies at the cost of requiring those
CLIs to be installed. Since the target users are platform engineers who already have
these tools, this may be acceptable.
