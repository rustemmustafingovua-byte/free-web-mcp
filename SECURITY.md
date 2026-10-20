# Security policy

## Reporting a vulnerability

Use **Security → Report a vulnerability** on GitHub. Do not open a public
issue for a suspected flaw in the signing or policy code.

## Trust model

This package holds a private key and signs USDC payments. Treat it as a hot
wallet.

- the private key lives only in the process that signs; it is never logged, never written by the library, and never included in an error
- a `SpendPolicy` is enforced **before** signing — daily cap, per-request cap, payment count, payee allow-list, blocked contracts, per-network cap
- the policy is the boundary: a model that can call the tool still cannot raise a cap
- use a dedicated wallet with only the funds it needs

`x402` payments are irreversible on-chain. Test on a small amount first.
