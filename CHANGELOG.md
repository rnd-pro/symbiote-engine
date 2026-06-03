# Changelog

## 0.3.0-alpha.6

- Updated package metadata to point at the standalone `symbiote-engine` repository.
- Published this release as a metadata-only registry correction after the repository split.

## 0.3.0-alpha.5

- Published explicit package subpath exports for UI-safe engine helpers used by `symbiote-ui`.

## 0.3.0-alpha.4

- Split runtime execution from the former `symbiote-node` monolith.
- Added `symbiote-engine` package exports for runtime primitives, CLI, server helpers, and packs.
- Kept browser UI ownership out of the engine package.
