# Nest & Key — Code Instructions

## Design system
Before implementing any UI change, read `DESIGN_HANDOFF.md` (dev branch) in full. It is the single source of truth for brand rules, component specs, and design decisions. Never implement UI that contradicts it without flagging the conflict first.

## Sole writer of DESIGN_HANDOFF.md
Code is the only writer of `DESIGN_HANDOFF.md`. When implementing a design change, update the doc in the same commit as the code change. Claude Design (separate web tool, no repo access) proposes changes via handoff files the user pastes in — those handoffs are transient work orders, not records; the doc is the record.

## Design briefs
When the user asks for a "brief for Design on [component]", produce a single copy-paste block containing: (1) the component's current CSS and HTML as on dev, with file:line refs, (2) the relevant DESIGN_HANDOFF.md sections, (3) the current Vercel preview URL, (4) recent changes that touched the component. Keep it scoped to the named component — it is task context, not a status report.

Claude Design has no memory across chats, so every brief must open with this working-agreement header before the task context:

> **Working agreement:** The repo's `DESIGN_HANDOFF.md` (maintained by Code) is the durable design record — you propose, Code records. Treat this brief as ground truth over anything from prior sessions; your past handoffs are transient work orders, not current state. When you finalize a decision, state explicitly which rules/values Code should record in `DESIGN_HANDOFF.md`.

## Sync rule
Any PR from `dev → main` must include `DESIGN_HANDOFF.md` if it was updated on dev. Never merge a PR that leaves the design doc behind.

## Branching
- All work starts on `dev`. Never push directly to `main`.
- `main` requires a PR. Each push to `dev` generates a Vercel preview URL for testing.
