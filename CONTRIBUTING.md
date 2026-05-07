# Contributing to SafeNudge

SafeNudge is a personal project, open-sourced under [Apache-2.0](./LICENSE) so others can read, learn from, fork, and adapt it. It is not actively seeking contributors, and the author makes no commitment to triage, review, or merge issues and pull requests on any timeline.

## What this means in practice

- **Forking is encouraged.** If you want to build something on top of this — a tanda app, a kye protocol, a susu vault, an English-speaking variant — please fork. Adapt freely. The Apache-2.0 license grants the rights you need; the only conditions are preserving copyright notices and noting modifications.
- **Issues may not get a response.** If you find a bug or have a question, feel free to open one. Triage is best-effort and may not happen at all.
- **Pull requests may not get reviewed.** If you want to contribute a fix, open a PR — but the author reserves the right to close it without action, especially if it expands scope beyond the project's current direction.
- **Security issues should be reported privately.** If you find a vulnerability, please email the address on the author's GitHub profile rather than opening a public issue.

## If you do open a PR

A few baseline expectations to make it more likely to be looked at:

- Match the engineering standards in [`CLAUDE.md`](./CLAUDE.md) — checked arithmetic, explicit account constraints, `transfer_checked`, status-as-first-validation, etc.
- Pass CI (`anchor build`, `anchor test`, `tsc --noEmit`, `npm run build`, security-lint).
- Include a happy-path test and at least one error-case test for any new instruction or instruction-level change.
- Keep the diff focused — one logical change per PR.

## Why these expectations exist

The protocol holds user funds. The standards in [`CLAUDE.md`](./CLAUDE.md) — derived in part from the Drift exploit post-mortem — are non-negotiable for any code that touches the program. The frontend has more room for stylistic variation, but the i18n and design-token rules apply.

## Author

Davi Giroux — see GitHub profile for contact.
