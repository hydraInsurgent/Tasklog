# Lessons Learned

<!-- Keep entries concise. For deep dives into why a concept works, use /learning-opportunity instead. -->

## What I Learned
<!-- Add entries after each session where you learned something new -->

## Mistakes to Avoid
<!-- Add patterns that caused problems so they don't repeat -->

- **`tsc` + `jest` do NOT parse `globals.css`.** A CSS error there - e.g. a `*/` inside a comment (writing `zinc-*/blue-600` prematurely closes the `/* */` block) - passes typecheck AND the whole Jest suite, then blows up only at `next dev`/`next build` (Turbopack/lightningcss). After editing `globals.css`, verify it compiles. `next build` is doppel-blocked, so quickest check from `frontend/`:
  `node -e 'const fs=require("fs"),pc=require("postcss"),tw=require("@tailwindcss/postcss");pc([tw()]).process(fs.readFileSync("src/app/globals.css","utf8"),{from:"src/app/globals.css"}).then(r=>console.log("ok",r.css.length)).catch(e=>{console.error(e.message);process.exit(1)})'`
  (#73 Stage B)

## Patterns That Work
<!-- Add approaches and conventions that proved effective -->
