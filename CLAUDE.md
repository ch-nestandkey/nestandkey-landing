# Nest & Key — Code Instructions

## Design system
Before implementing any UI change, read `DESIGN_HANDOFF.md` (dev branch) in full. It is the single source of truth for brand rules, component specs, and design decisions. Never implement UI that contradicts it without flagging the conflict first.

## Sync rule
Any PR from `dev → main` must include `DESIGN_HANDOFF.md` if it was updated on dev. Never merge a PR that leaves the design doc behind.

## Branching
- All work starts on `dev`. Never push directly to `main`.
- `main` requires a PR. Each push to `dev` generates a Vercel preview URL for testing.
