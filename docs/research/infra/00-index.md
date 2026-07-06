# Infrastructure Harness — Research Index

> **Date**: 2026-05-11
> **Status**: Draft
> **Author**: Platform Team

## Context

spec-bridge-v2 solves a specific problem: guiding an LLM through a specification-driven
software development lifecycle and verifying that the output (source code, tests, docs)
conforms to a human-confirmed specification. Its artifacts are markdown files with YAML
frontmatter, its workspace is a single git repository, and its verification is
structural (frontmatter schemas, lane transitions, file existence).

A parallel need exists for **infrastructure operations**. The platform team regularly
produces RFCs (e.g., RFC-017: Replace BuildKitd with Podman) that describe changes
spanning multiple systems — Terraform repositories, Kubernetes clusters, CI pipeline
templates, GitOps delivery repos, and cloud provider consoles. These changes:

- Produce **configuration** as the primary artifact (HCL, YAML manifests, Helm values,
  CI templates), not application source code.
- Span **multiple repositories** with no shared runtime — they communicate through
  well-defined interfaces (git pushes trigger Flux reconciliation; Terraform state files;
  ECR image tags referenced by K8s manifests; CI variable inheritance).
- Follow a **phased rollout** pattern: prove the change in one system, validate it works
  end-to-end, then propagate to consumers and decommission the old path.
- Require **verification against live systems** — `kubectl get`, `terraform plan`,
  `aws ecr describe-repositories` — not just file-level schema checks.
- Often involve **RFC-grade decision documentation** before any configuration is written.

## Problem Statement

There is no structured harness that:

1. Takes an RFC or infrastructure specification as input
2. Guides an LLM (or human) through a phased implementation plan across multiple systems
3. Validates that the configuration changes conform to the specification at each phase
4. Verifies the actual system state matches the intended state after each phase
5. Produces an auditable record of what changed, where, and why

Today, the process is ad-hoc: an RFC is written in Notion, implementation happens
manually across repositories, and verification is manual `kubectl` and `terraform plan`
runs. The gap between "RFC accepted" and "fully implemented and verified" is unstructured.

## Requirements

### Must Have

- **R1**: Accept an RFC or infrastructure specification as the source of truth
- **R2**: Decompose the spec into phases that respect cross-system dependencies
- **R3**: Track which systems need changes and in what order
- **R4**: Validate configuration artifacts (HCL, YAML, Helm values) against declared intent
- **R5**: Verify live system state against expected state at each phase
- **R6**: Work across multiple git repositories (not just one workspace)
- **R7**: Produce audit-grade records of what was changed and verified

### Should Have

- **R8**: Integrate with the existing RFC workflow (Notion or markdown-based)
- **R9**: Support dry-run / plan modes before actual system changes
- **R10**: Be instruction-driven (work with any LLM agent, not IDE-locked)
- **R11**: Reuse spec-bridge concepts where they transfer cleanly

### Nice to Have

- **R12**: Support rollback verification (confirm old resources are cleaned up)
- **R13**: Integrate with existing CI/CD pipelines (GitLab CI, Flux, ArgoCD)
- **R14**: Progressive disclosure — simple changes don't need the full ceremony

## Key Differences from spec-bridge-v2

| Dimension | spec-bridge-v2 | Infrastructure harness |
|-----------|---------------|----------------------|
| Primary artifact | Source code + tests | Configuration files (HCL, YAML, Helm) |
| Workspace | Single git repo | Multiple repos + live systems |
| Verification | File-level schema + structural checks | File-level + live system state queries |
| Lifecycle | spec → plan → WP → implement → review | RFC → phases → per-system changes → verify |
| Scope of change | One codebase | Cross-cutting: Terraform, K8s manifests, CI templates, cloud resources |
| Communication | In-process (same repo) | Git-mediated (push → reconcile → observe) |
| Rollback | Git revert | Multi-system decommission sequence |
| Decision record | spec.md | RFC (Notion or markdown) |

## Example: RFC-017 as a Concrete Use Case

The BuildKitd → Podman migration (RFC-017) is a canonical example:

**Systems involved:**
1. `bf-container-base-images` — Dockerfile + CI templates (add Podman, create `.podman_build_template`)
2. `bf-runner-allinone` — Runner image (add `podman` + `buildah` packages)
3. `ci-templates` — Shared CI modules (replace `buildctl` with `podman build`)
4. `gitops-delivery-v1` — Flux kustomizations (remove buildkitd manifests)
5. `applications-delivery` — New GitOps target (do NOT carry buildkitd forward)
6. `bf-terraform` — EKS node groups (decommission `BridgefundDevelopmentBuildKitv3`)
7. 6 consumer repos — Each needs a 3-line CI script change

**Phases:**
1. Add Podman to runner image → build & push new image
2. Create `.podman_build_template` alongside `.buildctl_build_template` → parallel validation
3. Cut over `ci-templates` → verify downstream builds succeed
4. Update consumer repos → verify all pipelines green
5. Remove buildkitd from `gitops-delivery-v1` → verify no stale pods
6. Decommission buildkit node group in `bf-terraform` → verify cost reduction

**Verification at each phase is different:**
- Phase 1: `podman --version` inside runner pod
- Phase 2: Build succeeds, image digest matches, ECR push succeeds
- Phase 3: Downstream pipelines pass
- Phase 5: `kubectl get deployment -n gitlab-runner | grep buildkitd` returns empty
- Phase 6: `terraform plan` shows node group removed; AWS console confirms no instances

## Design Alternatives

| Document | Approach | Key Idea |
|----------|----------|----------|
| [01-alternative-a.md](01-alternative-a.md) | **Extend spec-bridge** | Add infra skills + multi-repo support to spec-bridge-v2 |
| [02-alternative-b.md](02-alternative-b.md) | **Purpose-built harness** | New tool designed from scratch for infra operations |
| [03-alternative-c.md](03-alternative-c.md) | **RFC-first controller** | RFC document drives a state machine across systems |
| [06-alternative-d.md](06-alternative-d.md) | **Agent-as-orchestrator** | LLM is the control plane; tool only validates; executor prompts bridge agents |
| [04-naming-analysis.md](04-naming-analysis.md) | **Naming exploration** | Name candidates and the trade-offs behind each |
| [05-tradeoff-matrix.md](05-tradeoff-matrix.md) | **Comparison matrix** | Side-by-side evaluation of all alternatives |

## References

- [spec-bridge-v2 README](../../README.md)
- [spec-bridge-v2 workflow overview](../../c4/3-workflow-overview.md)
- [RFC-017: Replace BuildKitd with Podman](/Users/rodrigo.leven/projects/bf-container-base-images/docs/RFC-017-replace-buildkitd-with-podman.md)
- [Platform RFC skill](/.agents/skills/process/planning/platform-rfc/SKILL.md)
- [Verification script spec](../verify/verification-script-spec.md)
- [Notion RFC page](https://www.notion.so/bf-public/RFC-30373ef492b480bb95d9daf35368cd36)
