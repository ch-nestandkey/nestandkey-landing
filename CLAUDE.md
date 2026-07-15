# Nest & Key — Code Instructions

## Design system
Before implementing any UI change, read `DESIGN_HANDOFF.md` (dev branch) in full. It is the single source of truth for brand rules, component specs, and design decisions. Never implement UI that contradicts it without flagging the conflict first.

## Sole writer of DESIGN_HANDOFF.md
Code is the only writer of `DESIGN_HANDOFF.md`. When implementing a design change, update the doc in the same commit as the code change. Claude Design (separate web tool, no repo access) proposes changes via handoff files the user pastes in — those handoffs are transient work orders, not records; the doc is the record.

## Design briefs
When the user asks for a "brief for Design on [component]", produce a single copy-paste block containing: (1) the component's current CSS and HTML as on dev, with file:line refs, (2) the relevant DESIGN_HANDOFF.md sections, (3) the current Vercel preview URL, (4) recent changes that touched the component. Keep it scoped to the named component — it is task context, not a status report.

Claude Design has no memory across chats, so every brief must open with this working-agreement header before the task context:

> **Working agreement:** The repo's `DESIGN_HANDOFF.md` (maintained by Code) is the durable design record — you propose, Code records. Treat this brief as ground truth over anything from prior sessions; your past handoffs are transient work orders, not current state. When you finalize a decision, state explicitly which rules/values Code should record in `DESIGN_HANDOFF.md`. **Ask before writing or finalizing any handoff artifact** (an implementation contract, `HANDOFF_*.md`, `snippets.html`, or similar) — present the proposal in chat and wait for explicit go-ahead before creating the file.

## Sync rule
Any PR from `dev → main` must include `DESIGN_HANDOFF.md` if it was updated on dev. Never merge a PR that leaves the design doc behind.

## Branching
- All work starts on `dev`. Never push directly to `main`.
- `main` requires a PR. Each push to `dev` generates a Vercel preview URL for testing.

## Never trust a Design handoff's claims about current state
Claude Design has no live repo access and no cross-chat memory. Any handoff — a prompt, a zip, a downloaded file — may assert something about "what's currently live" or "what hasn't shipped" that is wrong, because it's working from an aging snapshot, not the repo. This has caused real incidents: a stale design-system project, a "clean working tree" assumption that didn't hold, a file dump that would have wiped Cloudinary credentials and the photo-thumbnail feature, and a README claiming unshipped sections that had been live for weeks.

Standing rule: **always diff a Design handoff against the live repo file before applying anything.** Never apply a full file Design provides as a blind overwrite — check each change against what's actually in the repo, and apply only the parts that are genuinely new and non-regressive. If the handoff includes claims about deployment status ("not yet pushed", "already live"), verify with `git log` / `grep` rather than trusting the claim.

Prefer diff-shaped handoffs (explicit old→new pairs or unified diffs) over full-file dumps when asking Design for a change — they self-audit; full files don't. If a full file arrives anyway, treat it as reference material to diff against, never as something to drop in directly.

## Design-system sync is a completion step, not an afterthought
Whenever a code change touches shared/reusable CSS or components (not one-off page copy), sync the "Nest & Key Design System" project via `DesignSync` as part of finishing that work — the same way `DESIGN_HANDOFF.md` gets updated in the same commit. It does not sync automatically and has drifted silently before.
