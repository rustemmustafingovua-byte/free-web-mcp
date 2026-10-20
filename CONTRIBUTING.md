# Contributing

## Scope

The library is small on purpose: one protocol client, one policy, one CLI.

- plain JavaScript, ESM, no build step
- `viem` is the only runtime dependency
- every change needs a test (`npm test`)

## Adding a network

1. implement the payment scheme for that network in `src/`
2. extend `pickOption()` to select it
3. add a test that covers the new option
4. document it in the README table

## Bounties

Issues labelled `💰 Reward` can be funded by anyone with `/reward <amount>`
(Opire) or via Algora. The money is paid to the merged PR, not to the repo
owner.
