# Changelog

All notable changes to this project follow
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Solana USDC (SPL) signing for x402
- MCP server exposing wallet and policy operations
- `x402-policy.json` file format for portable policies

## [0.1.0] - 2026-10-20

### Added
- x402 v2 "exact" scheme on Base with EIP-3009 `transferWithAuthorization`
- `SpendPolicy`: daily cap, per-request cap, payment count, payee allow-list, blocked contracts, per-network cap
- generic client for any x402 endpoint (`X402Client.fetch`)
- CLI `ax402` with `new`, `balance`, `quote`, `pay`, `policy`
- CI on Node 20/22/24 and npm publishing on tag
