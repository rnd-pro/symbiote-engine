# Changelog

## Unreleased

- Updated the public README and package description to match the shared
  RND-PRO package presentation style.

## 0.3.0-alpha.11

- Kept `packs/video-pack.js` browser-safe by registering through the registry primitive instead of the Node-only root entrypoint.

## 0.3.0-alpha.10

- Added `symbiote-engine/browser`, a browser-safe runtime entrypoint for UI packages.
- Kept Node-only handler loading, server, CLI, and file-system helpers out of browser imports.

## 0.3.0-alpha.7

- Updated runtime identity strings, log prefixes, temporary workspace names, and handler metadata to use `symbiote-engine`.

## 0.3.0-alpha.6

- Updated package metadata to point at the standalone `symbiote-engine` repository.
- Published this release as a metadata-only registry correction after the repository split.

## 0.3.0-alpha.5

- Published explicit package subpath exports for UI-safe engine helpers used by `symbiote-ui`.

## 0.3.0-alpha.4

- Split runtime execution from the former `symbiote-node` monolith.
- Added `symbiote-engine` package exports for runtime primitives, CLI, server helpers, and packs.
- Kept browser UI ownership out of the engine package.
