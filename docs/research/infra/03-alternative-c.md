# Alternative C: RFC-First Controller with Pluggable Executors

> **Approach**: The RFC document is the control plane. A lightweight state machine
> tracks phase progression across systems, and pluggable executors handle the actual
> changes and verification. The controller itself never modifies infrastructure —
> it only tracks, validates, and reports.
> **Working name**: "rfc-engine" or "ops-bridge"

---

## Core Idea

This alternative inverts the relationship between the harness and the work:

- In spec-bridge, the **tool validates after the agent acts**.
- In Alternative A, the **tool validates after the agent acts** (same pattern, more probes).
- In Alternative B, the **tool validates after the agent acts** (same, new codebase).
- In Alternative C, the **RFC drives a state machine** that tells agents (or humans
  or CI pipelines) what to do next, and the state machine advances only when
  verifiable evidence is provided.

The controller is **reactive, not prescriptive**. It doesn't generate instructions
for how to make changes — it tracks *what must be true* at each phase and gates
progression on *evidence that it is true*.

Think of it as a **Kubernetes operator for infrastructure changes** — it watches
desired state (the RFC) and reconciles observed state (probe results), but it
never modifies state directly.

---

## Architecture

```
rfc-engine/
├── src/rfc_engine/
│   ├── __main__.py
│   ├── config.py
│   │
│   ├── core/
│   │   ├── state_machine.py   # Phase state machine (planned→gated→done)
│   │   ├── evidence.py        # Evidence submission + validation
│   │   ├── dag.py             # Phase dependency DAG
│   │   ├── reconciler.py      # Desired vs observed state reconciliation
│   │   └── output.py          # JSON verdicts
│   │
│   ├── rfc/
│   │   ├── parser.py          # RFC → structured phases
│   │   └── schema.py          # RFC validation
│   │
│   ├── gates/
│   │   ├── protocol.py        # Gate Protocol
│   │   ├── file_exists.py     # File in repo on branch
│   │   ├── ci_green.py        # CI pipeline succeeded
│   │   ├── resource_absent.py # K8s resource no longer exists
│   │   ├── resource_present.py# K8s resource exists + healthy
│   │   ├── plan_clean.py      # terraform plan shows no diff
│   │   ├── manual_approval.py # Human signed off
│   │   └── composite.py       # AND/OR gate combinators
│   │
│   ├── executors/             # OPTIONAL — pluggable change executors
│   │   ├── protocol.py        # Executor Protocol
│   │   ├── agent.py           # LLM agent executor (generates SKILL.md instructions)
│   │   ├── ci.py              # Trigger a CI pipeline as the executor
│   │   ├── terraform.py       # Run terraform apply
│   │   └── manual.py          # Human executor (prints instructions, waits for evidence)
│   │
│   └── report/
│       ├── audit_trail.py     # Full phase-by-phase audit log
│       └── dashboard.py       # Summary view (which phases done, which pending)
│
├── schemas/v1/
│   ├── rfc.yaml
│   ├── phase.yaml
│   ├── gate.yaml
│   └── evidence.yaml
│
└── rfc-engine.yaml            # Project config
```

### Key Abstractions

#### Phase State Machine

Each phase has a richer state model than a simple lane:

```
                    ┌─────────────┐
                    │   planned   │
                    └──────┬──────┘
                           │  start
                    ┌──────▼──────┐
                    │  executing  │
                    └──────┬──────┘
                           │  submit evidence
                    ┌──────▼──────┐
               ┌───►│   gated     │◄── evidence insufficient
               │    └──────┬──────┘    (re-submit with more evidence)
               │           │  all gates pass
               │    ┌──────▼──────┐
               │    │    done     │
               │    └─────────────┘
               │
          evidence
          rejected
```

`gated` is the distinctive state: the phase has been executed (configuration
changes were made), but the controller requires *evidence* that the changes
achieved their intent before advancing. Evidence is provided as structured
proof — probe results, CI pipeline URLs, screenshots, manual sign-offs.

#### Gates

Gates define what must be true for a phase to advance. They are composable:

```yaml
gates:
  - type: ci_green
    description: "Runner image build succeeds with podman"
    ci_system: gitlab
    project: bf-container-base-images
    pipeline_ref: main
    job: build-runner

  - type: resource_present
    description: "Runner pod has podman binary"
    system: dev-cluster
    resource: pod
    namespace: gitlab-runner
    label_selector: "app=gitlab-runner"
    check: "exec podman --version"

  - type: composite
    operator: AND
    gates:
      - type: file_exists
        repo: ci-templates
        branch: infra/rfc-017-podman
        path: "v3-modern/modules/deployment/build-service/.nodejs-build.yml"
        contains: "podman"
      - type: ci_green
        ci_system: gitlab
        project: bf-nestjs-template
        pipeline_ref: infra/rfc-017-podman
```

#### Evidence Model

Evidence is submitted to the controller to advance gates:

```python
class Evidence(TypedDict):
    evidence_id: str        # unique ID
    phase_id: str           # which phase this evidence applies to
    gate_id: str            # which gate this satisfies
    evidence_type: str      # "probe_result", "ci_url", "manual_approval", "screenshot"
    payload: dict           # type-specific structured data
    submitted_by: str       # "agent:cursor", "human:rodrigo", "ci:pipeline-12345"
    submitted_at: str       # ISO timestamp
    verified: bool          # controller confirmed the evidence is valid
    verification_details: str
```

Evidence can come from:
- **Automated probes** run by the controller itself
- **CI pipelines** that report back via webhook or API polling
- **LLM agents** that run commands and submit the output
- **Humans** who manually verify and sign off

#### Reconciler

The reconciler is the controller's main loop. It compares desired state (RFC phases)
with observed state (evidence) and produces a report:

```python
class ReconcileResult(TypedDict):
    rfc_id: str
    total_phases: int
    done: int
    gated: int          # waiting for evidence
    executing: int
    planned: int
    blocked: list[str]  # phases whose deps aren't met
    next_actions: list[str]  # what to do next
```

---

## Lifecycle

```
RFC document
     │
     ▼
 ┌────────┐    Parse RFC into phases + gates
 │ ingest  │    Each phase declares its gate conditions
 └────┬───┘
      │
      ▼
 ┌────────┐    Validate DAG, check all gates are satisfiable
 │ plan    │    Output: rfc-plan.md + phases/Pxx.md
 └────┬───┘
      │
      ▼
 ┌─────────────────────────────────────┐
 │     Controller Loop (reconcile)      │
 │                                      │
 │  For each phase in DAG order:        │
 │    1. Check dependencies (all done?) │
 │    2. Dispatch to executor           │
 │       - Agent: generate instructions │
 │       - CI: trigger pipeline         │
 │       - Manual: print instructions   │
 │    3. Collect evidence               │
 │    4. Evaluate gates                 │
 │    5. Advance state if gates pass    │
 │                                      │
 │  Repeat until all phases done        │
 │  or blocked phases cannot advance    │
 └─────────────────────────────────────┘
      │
      ▼
 ┌────────┐    Verify decommission gates
 │ close   │    Generate audit report
 └────────┘
```

### The Controller Does Not Make Changes

This is the key architectural decision. The controller:

- **Tracks** which phases are in which state
- **Evaluates** gates against submitted evidence
- **Reports** what needs to happen next
- **Never** runs `kubectl apply`, `terraform apply`, or `git push`

Changes are made by **executors** — which can be LLM agents, CI pipelines, or humans.
The controller's job is to verify that changes achieved their intent.

This separation means:
- The controller has no dangerous permissions (no write access to clusters, no
  terraform state locks, no git push credentials)
- Evidence is explicit and auditable
- Different phases can use different executors (Phase 1 by an agent, Phase 5 by
  a human with kubectl access)

---

## Executor Model

Executors are pluggable strategies for how changes get made:

### Agent Executor

Generates SKILL.md-style instructions for an LLM agent. The agent reads the
instructions, makes changes, and the controller collects evidence.

```yaml
executor:
  type: agent
  agent: cursor
  instructions_template: |
    You are implementing phase {{phase_id}} of RFC {{rfc_id}}.

    Target repository: {{repo}}
    Branch: {{branch}}

    Changes required:
    {{changes}}

    After making changes, run these verification commands and report results:
    {{verification_commands}}
```

### CI Executor

Triggers a CI pipeline and monitors it. The pipeline itself makes the changes
(e.g., a Terraform apply pipeline, a Helm deploy pipeline):

```yaml
executor:
  type: ci
  provider: gitlab
  project: bf-terraform
  trigger:
    ref: infra/rfc-017-podman
    variables:
      RFC_PHASE: P06
      ACTION: apply
```

### Manual Executor

Prints instructions for a human and waits for evidence submission:

```yaml
executor:
  type: manual
  instructions: |
    This phase requires manual intervention:
    1. Log into AWS Console
    2. Navigate to EKS > Node Groups
    3. Delete 'BridgefundDevelopmentBuildKitv3'
    4. Confirm deletion
    5. Run: rfc-engine submit-evidence --phase P06 --type manual_approval
```

### Terraform Executor

Wraps `terraform plan` / `terraform apply` with proper state locking and
output capture:

```yaml
executor:
  type: terraform
  workspace: development
  repo: bf-terraform
  auto_approve: false  # requires manual approval gate after plan
```

---

## Integration with RFC Workflow

This alternative has the tightest integration with the existing RFC process:

```
Notion RFC page (Pending)
     │
     ├── Developer writes RFC
     ├── Team reviews and comments
     ├── RFC status → Accepted
     │
     ▼
rfc-engine ingest <RFC-file-or-notion-url>
     │
     ├── Parses RFC into phases
     ├── Creates gate definitions
     ├── Generates phase files
     │
     ▼
rfc-engine reconcile --watch
     │
     ├── Shows dashboard of phase states
     ├── Dispatches to executors
     ├── Collects evidence
     ├── Advances gates
     │
     ▼
Notion RFC page (Implemented)
     │
     ├── rfc-engine updates RFC status
     ├── Audit trail linked from RFC
     └── All evidence archived
```

The `reconcile` command can run as a long-lived process (like a controller)
or as a one-shot command that evaluates current state and prints next actions.

---

## Trade-offs

### Advantages

- **Separation of concerns**: The controller is read-only with respect to
  infrastructure. It tracks, validates, and reports. It never applies.
  This is the safest possible architecture for infrastructure changes.
- **Evidence-based progression**: Every phase advancement requires proof.
  The audit trail is built into the architecture, not bolted on.
- **Mixed executors**: Phase 1 can be automated by an LLM agent while
  Phase 5 requires a human with admin access. The same system handles both.
- **Reconciliation model**: Familiar to anyone who has worked with Kubernetes
  operators or GitOps. "Desired state vs observed state" is a well-understood
  pattern for infrastructure.
- **Composable gates**: AND/OR gate combinators handle complex verification
  requirements without custom code.
- **Incremental adoption**: Can start with manual executors for everything
  and gradually automate phases as confidence grows.

### Disadvantages

- **Highest complexity**: Three abstractions (state machine, gates, executors)
  instead of one (skills). More concepts to learn and maintain.
- **Over-engineering risk for small changes**: A 3-line CI script change across
  6 repos doesn't need a state machine with composable gates. The ceremony-to-value
  ratio may be poor for simple operations.
- **Controller as bottleneck**: If the controller must be running to advance phases,
  it becomes a coordination point. If it's a CLI you run manually, the "reconcile
  loop" is just the human running it periodically.
- **Evidence collection complexity**: Mapping CI pipeline results, kubectl output,
  and terraform plans into structured evidence requires significant adapter code.
- **Not instruction-driven for the controller itself**: The controller is a program,
  not a set of instructions an LLM follows. An LLM can *use* it (call the CLI) but
  doesn't *follow* it (read a SKILL.md). This is a departure from spec-bridge's
  design philosophy.
- **Notion integration is a coupling point**: If the team moves away from Notion,
  the RFC ingestion needs updating. Markdown RFCs (like RFC-017) avoid this.

### Risk: "Kubernetes Operator Syndrome"

The reconciliation model is powerful but can lead to the classic operator problem:
the controller becomes a complex state machine that is itself hard to debug. When
a phase is stuck in `gated`, is it because the evidence is wrong, the gate
definition is wrong, or the system state is genuinely not matching expectations?

**Mitigation**: Rich logging at every gate evaluation. The `reconcile` output
must show not just "gate X failed" but "gate X expected Y, observed Z, evidence
was W." The controller must be more transparent than the system it monitors.

---

## How It Handles the RFC-017 Example

```
rfc-engine ingest ./RFC-017-replace-buildkitd-with-podman.md

# Controller creates:
infra-specs/rfc-017/
├── rfc-spec.md          (normalized RFC with frontmatter)
├── systems.yaml         (7 repos + 1 cluster + 1 cloud account)
├── phases/
│   ├── P01-add-podman-to-runner.md
│   │   executor: agent
│   │   gates: [ci_green(build-runner), resource_present(podman-in-pod)]
│   │
│   ├── P02-parallel-build-template.md
│   │   executor: agent
│   │   gates: [file_exists(.podman_build_template), ci_green(parallel-build)]
│   │
│   ├── P03-update-ci-templates.md
│   │   depends_on: [P01, P02]
│   │   executor: agent
│   │   gates: [ci_green(nestjs-template-build), ci_green(nextjs-template-build)]
│   │
│   ├── P04-update-consumers.md
│   │   depends_on: [P03]
│   │   executor: manual  (6 repos, each a 3-line change)
│   │   gates: [ci_green(scarlet), ci_green(bloom), ci_green(airweave), ...]
│   │
│   ├── P05-remove-buildkitd.md
│   │   depends_on: [P03, P04]
│   │   executor: agent
│   │   gates: [resource_absent(buildkitd-deploy), resource_absent(buildkit-certs)]
│   │
│   └── P06-decommission-nodegroup.md
│       depends_on: [P05]
│       executor: terraform
│       gates: [plan_clean(development), manual_approval(cost-confirmed)]

rfc-engine reconcile --rfc rfc-017
# Output:
# Phase  | State    | Gates       | Next Action
# P01    | planned  | 0/2 passed  | Dispatch agent to bf-container-base-images
# P02    | planned  | 0/2 passed  | Blocked by P01
# P03    | planned  | 0/2 passed  | Blocked by P01, P02
# P04    | planned  | 0/6 passed  | Blocked by P03
# P05    | planned  | 0/2 passed  | Blocked by P03, P04
# P06    | planned  | 0/2 passed  | Blocked by P05
```
