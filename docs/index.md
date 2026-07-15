# Building Software with Synthesis-Driven Development

A practical guide for developers new to specification-driven workflows.

---

# Part 1: What Is Synthesis-Driven Development?

## The Problem

Most software projects start the same way. Someone describes what they want. A developer jumps into code. Along the way, they discover edge cases nobody thought of, make architectural choices under pressure, and end up with a system whose structure reflects the order in which problems were discovered rather than the nature of the problems themselves.

The result is familiar: modules that seem logical ("UserService", "PaymentController", "OrderRepository") but hide tangled dependencies. Changing the payment flow breaks inventory. Adding a delivery option requires touching five services. The architecture mirrors how the team thought about the problem, not how the problem actually works.

Synthesis-Driven Development (SyDD) is a methodology that fixes this. Instead of organizing software around intuitive categories, it analyzes how requirements interact and derives the system's structure from that analysis. The architecture mirrors the problem's structure, not the developer's mental model.

## The Key Idea: Misfits Instead of Requirements

Traditional development starts with requirements -- statements about what a system should do:

> "The system must handle payment failures gracefully."

This is vague. What does "gracefully" mean? Which components are involved? How does this interact with order processing? Requirements describe intent but hide the real complexity.

SyDD starts from the opposite direction. Instead of asking "what should the system do?", it asks "how can the system fail?"

> "Misfit: The payment fails, but the order is still sent to the restaurant's kitchen."

This is concrete. It names two specific things (payment, kitchen notification) and a specific failure (one fails but the other proceeds). It immediately reveals that payment and order dispatch are coupled -- you cannot design one without considering the other.

These failure scenarios are called **misfits** -- ways the system can fail to satisfy its environment. They are the foundation of SyDD.

## Why Misfits Work Better

Misfits have three properties that make them powerful for design:

**They are testable.** "Handle payment failures gracefully" has no clear test. "Payment fails but order reaches the kitchen" is a test case you can write right now.

**They reveal structure.** If two misfits interact -- resolving one forces you to change how you resolve the other -- they belong in the same subsystem. If they do not interact, they can be designed independently. This interaction pattern reveals the natural architecture.

**They are binary.** Either the system handles the situation or it does not. There is no ambiguity about whether a misfit has been resolved.

## The Origin: Christopher Alexander

SyDD is grounded in the work of architect Christopher Alexander, who published *Notes on the Synthesis of Form* in 1964. Alexander was solving a problem in building design: how do you decompose a complex design into parts that can be worked on independently?

His answer was methodical:

1. List every way a design can fail its environment (misfits).
2. Map which failures affect each other (the interaction graph).
3. Group tightly interacting failures into clusters (subsystems).
4. Design each cluster independently.

The clusters have a critical property: things inside a cluster strongly affect each other (dense internal coupling), while things in different clusters barely affect each other (sparse external coupling). This is exactly the property that makes good software modules.

Alexander demonstrated the power of decomposition with a simple analogy. Imagine 100 lights that need to reach a stable state. If they are all independent, equilibrium takes 2 seconds. If they are all coupled together, it takes longer than the age of the universe. But if you group them into 10 subsystems of 10 lights each, it takes 15 minutes.

The lesson: complex systems only become tractable when you find the right subsystem boundaries. Those boundaries exist in the problem itself -- the designer's job is to discover them, not invent them.

## The Five Phases of SyDD

SyDD organizes development into five phases:

### Phase 1: Context Gathering

Understand the system's environment. Who uses it? What external systems does it interact with? What business rules apply? Then identify every way the system can fail that environment -- every misfit. Tag each misfit with a domain (Data Integrity, Financial, Concurrency, Security, etc.) and note which misfits affect each other.

**You produce**: A specification document with use cases, misfits, constraints, and interaction notes.

### Phase 2: Decomposition

Analyze misfit interactions to discover natural subsystem boundaries. Build a graph where misfits are nodes and interactions are edges. Group tightly connected misfits into clusters. Each cluster becomes a subsystem.

**You produce**: A decomposition showing which misfits belong to which subsystem and why.

### Phase 3: Design

For each subsystem, define abstract components -- design elements that describe what behaviors and data the subsystem owns. Where subsystems must communicate, define explicit contracts specifying what data flows between them. The contract is the only permitted coupling.

**You produce**: A plan with abstract components per subsystem and inter-system contracts.

### Phase 4: Synthesis (Implementation)

Transform abstract components into code. Each component becomes a work package. For each misfit assigned to a work package, write a test that reproduces the failure condition (the misfit), then write the minimum code to make the test pass. This is Test-Driven Development (TDD), but driven by misfits rather than arbitrary test cases.

**You produce**: Working code in isolated branches, one per work package.

### Phase 5: Verification

Review each work package against its assigned misfits. Does it resolve them? Does it respect subsystem boundaries? Does it introduce new failure modes? Then merge the work packages into the main codebase.

**You produce**: A verified, merged feature.

## A Quick Note on TDD

Test-Driven Development is a practice where you write tests before writing implementation code. The cycle is:

1. **Red**: Write a test that describes the behavior you want. Run it. It fails (because the code does not exist yet).
2. **Green**: Write the minimum code to make the test pass.
3. **Refactor**: Clean up the code while keeping the test green.

In SyDD, the misfits tell you what tests to write. Each misfit is a failure scenario -- a test that says "the system fails in this specific way." You write a test that reproduces the misfit, then write code that eliminates it. This connects the analytical work (decomposition) directly to the implementation work (coding).

## Worked Example: Food Delivery Checkout

To make this concrete, here is SyDD applied to a food delivery checkout system.

### Context Gathering

**Use cases:**
- A customer submits food items to buy.
- The system charges the customer's credit card.
- The restaurant receives the order to start cooking.
- The system calculates delivery fees based on location.

**Misfits -- how the system can fail:**

| ID | Domain | Failure Scenario |
|----|--------|-----------------|
| A | Data Integrity | User submits an order with zero items or negative total |
| B | Inventory | User orders an item that sold out while browsing |
| C | Financial/State | Payment fails but order is sent to the kitchen |
| D | Logistics | Delivery address is outside the restaurant's radius |
| E | Concurrency | Two users order the last unit simultaneously; both accepted |
| F | Idempotency | Network timeout causes retry, creating a duplicate charge |

### Decomposition

Analyze which misfits interact:
- **A and B interact**: Both validate cart contents and availability. Fixing one affects how you fix the other.
- **C and F interact**: Both involve payment state. Idempotency (F) directly affects how payment failure (C) is handled.
- **E interacts with B**: Both involve item availability state.
- **D has near-zero interaction** with the others. Address validation is independent.

This reveals three natural subsystems:

1. **Order Subsystem** [Misfits A, B, E]: Everything about validating and assembling the order.
2. **Payment Subsystem** [Misfits C, F]: Everything about charging and financial state.
3. **Logistics Subsystem** [Misfit D]: Address and delivery fee calculation.

These boundaries were not decided by the developer -- they emerged from analyzing which misfits interact.

### Design

**Order Subsystem** components: CartValidator, InventoryChecker, OrderAssembler. Internal coupling: CartValidator must check InventoryChecker before OrderAssembler runs.

**Payment Subsystem** components: PaymentProcessor, IdempotencyGuard, TransactionLog. Internal coupling: IdempotencyGuard must approve before PaymentProcessor charges.

**Contract (Order -> Payment):** Order produces a validated OrderReceipt. Payment returns a PaymentResult. If payment fails, Order releases inventory holds.

### Synthesis

Work packages map to components:
- WP01: CartValidator + InventoryChecker. TDD targets: test zero-item rejection, test sold-out detection, test concurrent reservation conflict.
- WP02: PaymentProcessor + IdempotencyGuard. TDD targets: test payment failure does not notify kitchen, test duplicate charge prevention.
- WP03: Logistics validation. TDD targets: test out-of-radius rejection.
- WP04: Inter-system contracts. TDD targets: test contract compliance, test failure propagation.

Every misfit has a work package. Every work package has tests derived from its misfits.

---

# Part 2: Using spec-bridge-v2 to Build Software with SyDD

spec-bridge-v2 is a tool that guides you through the SyDD workflow step by step. It provides templates for each phase, validates that your artifacts have the required structure, and keeps everything organized in a predictable directory layout.

You do not need to memorize the methodology. The templates tell you what to fill in. The validation tool tells you if you missed something.

## How It Works

spec-bridge-v2 has eight skills, each corresponding to a step in the workflow. An AI coding assistant (like Cursor, Claude Code, or similar) reads the skill instructions and walks you through the process interactively. At the end of each step, a validation tool (`spec-bridge-skill-tool`) checks that the output has the required structure.

The workflow is linear:

```
specify -> decompose (optional) -> plan -> tasks -> implement -> review -> accept -> merge
```

Each step produces artifacts (markdown files with structured content) in a feature directory under `specs/`.

## Prerequisites

Install the skill tool:

```bash
cd skill-tool
pip install -e .
```

Initialize a project:

```bash
spec-bridge-skill-tool init --project-root .
```

This creates the `specs/` directory, copies schema files, and generates skill instruction files for your AI agent.

## Step 1: Specify -- Describe What You Are Building

**What happens**: You have a conversation with the AI agent about what you want to build. The agent asks discovery questions scaled to the complexity of the feature (1-2 for simple, 5+ for complex). Then it creates a `spec.md` file.

**Command**: Run the `spec-bridge-specify` skill (via slash command or agent instruction).

**What you produce**: A `specs/<feature-slug>/spec.md` file. The template has these sections:

### Context (mandatory)

Describe the environment the software operates in. The template asks for two things:

**System Interactions** -- Who and what interacts with this system? List external systems, user roles, data flows, and business processes.

**Use Cases** -- Each use case is a specific interaction. Use the format: `UC#: Actor + Action + Expected Outcome`.

For the food delivery example:
```markdown
## Context

### System Interactions

The checkout API interacts with: customers (via mobile/web app),
the restaurant management system (receives orders), a payment gateway
(Stripe), and a delivery routing service (calculates fees and ETAs).

### Use Cases

- **UC1**: Customer submits a list of food items to purchase
- **UC2**: System charges the customer's credit card via Stripe
- **UC3**: Restaurant receives the confirmed order to begin preparation
- **UC4**: System calculates delivery fee based on customer location
```

### Misfits (mandatory)

List every way the system can fail. Tag each with a domain. The template provides the format:

```markdown
## Misfits

- **Misfit A** (Data Integrity): User submits an order with zero items
  or a negative total cost
- **Misfit B** (Inventory): User orders an item that sold out while
  they were browsing the menu
- **Misfit C** (Financial/State): Payment fails but the order is still
  sent to the restaurant's kitchen

### Misfit Interaction Notes

A and B are linked -- both validate cart contents. C and F are linked --
both involve payment state management.
```

The validation tool requires at least 2 misfits. If you cannot identify 2 failure scenarios, the feature may be too trivial for formal specification.

### Remaining sections

The template also includes sections for User Scenarios (with Given/When/Then acceptance criteria), Requirements (functional and non-functional), Key Entities, Success Criteria, Assumptions, and Out of Scope. Fill these as you would in any specification.

### Validation

After writing spec.md, the AI agent runs: