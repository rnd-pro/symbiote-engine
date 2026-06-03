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
