# All benchmark campaigns

From the repository root:

```sh
npm run benchmark:all
```

The command runs these campaigns sequentially so their GPU measurements never overlap:

1. five representative renderer demos;
2. the five-label byte-identical null baseline; and
3. raw WebGPU versus real Three.js on the controlled static task.

It then builds and assembles the existing reports into `packages/benchmark-all/dist` and exits.

Launch that assembled multipage site separately:

```sh
npm run report:all
```

The report is served at `http://127.0.0.1:4173/`. Its overview links to `/representative/`, `/controlled/`, and `/controlled/architecture.html`. Press Ctrl+C to stop it. Use `npm run benchmark:all -- --headed` to show Chrome during every capture, or `npm run report:all -- --port=5000` to choose another local report port. Individual benchmark and report scripts remain available.

Every page uses the same light research-report layout and includes A4 landscape print rules for browser PDF export.
