import { defineConfig } from 'vitest/config';

// Vitest compiles the `.ts` files itself rather than going through Node's type
// stripping, and its compiler accepts syntax Node refuses (enums, namespaces,
// parameter properties). It also resolves a `./foo.js` import to `foo.ts`
// where Node would not. So a green test run is not proof the sources run
// under Node: `pnpm tsc` (with `erasableSyntaxOnly`) is.
export default defineConfig({
  test: {
    // Only src/, so the checkouts under .claude/worktrees/ and .worktrees/
    // aren't picked up as well.
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
