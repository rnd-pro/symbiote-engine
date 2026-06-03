# symbiote-engine

`symbiote-engine` owns the Symbiote runtime layer:

- graph primitives
- workflow execution
- runtime CLI commands
- server helpers
- registry, persistence, lifecycle, and handler loading
- runtime packs

It must stay independent from browser UI runtime modules.

```js
import { Graph, Executor, loadHandlers } from 'symbiote-engine';
```

Use `symbiote-ui` for provider catalogs, Web Components, layout metadata, and WebMCP descriptors.

## Related Packages

- [`symbiote-ui`](https://github.com/RND-PRO/symbiote-ui) - Web Components, provider catalogs, layout metadata, and WebMCP descriptors.
- [`symbiote-node`](https://github.com/RND-PRO/symbiote-node) - terminal migration facade for older imports.
- [Package split guide](https://github.com/RND-PRO/symbiote-node/blob/main/docs/package-split.md)
