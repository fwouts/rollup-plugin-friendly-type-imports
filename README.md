# rollup-plugin-friendly-type-imports

This plugin is primarily intended for Vite users who want to use TypeScript without being forced to set `isolatedModules: true` in their `tsconfig.json`.

It's also a valid Rollup plugin, and as such may be used in other, similar situations.

## What problem does this solve?

If you try to use Vite in a TypeScript codebase, you may run into issues if your code contains imports of re-exported types.

Imagine for example:
```ts
// foo/definitions.ts
export interface A {}

export const B = ...
```

```ts
// foo/index.ts
export { A, B } from './definitions';
```

```ts
// bar/usage.ts
import { A, B } from 'foo/definitions';
```

If you use Vite, this will fail because, once transpiled to JavaScript, `foo/index.js` tries to re-export an entity `A` from `foo/definitions.js`, but that value doesn't exist.

The browser will crash with:
```
Uncaught SyntaxError: The requested module '/foo/definitions.ts' does not provide an export named 'A'
```

## Solution

The solution is to generate a fake `A` entity, which is in fact the value `null`, so the browser will no longer complain. This is exactly what `rollup-plugin-friendly-type-imports` does.

## Usage

```js
// vite.config.js
import friendlyTypeImports from 'rollup-plugin-friendly-type-imports';

export default {
  plugins: [
    friendlyTypeImports()
  ],
};
```

## Performance

You should avoid using this plugin if you can.

Each TypeScript file needs to go through another round of parsing. This happens in JavaScript, so it can be significantly slower than the "pure" solution which only relies on esbuild.

## License

MIT