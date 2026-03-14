# Unit Test

Write unit tests for a feature, a specific component, or the whole project.
Detects the project type first, then uses the appropriate framework and conventions.

Usage:
- `/unit-test` on a feature branch - infers what to test from the plan and changed files
- `/unit-test [target]` - targets a specific controller, component, or function by name
- `/unit-test` on main with no active plan - scans for coverage gaps and suggests targets

---

## Step 1: Resolve the target

Two things always happen here, regardless of branch or arguments:

**A. Check git diff** - note any source files changed but not yet committed. These are the highest-priority targets because they represent work in progress.

**B. Cross-reference against coverage.md** - if `docs/tests/coverage.md` exists, scan the actual source files and compare against it. Any source file or public method that exists in the code but is not marked 🟩 in coverage.md is a gap - regardless of when it was committed. Git diff only sees uncommitted changes; coverage.md sees the full picture.

Then determine the scope using context in priority order:

1. **Argument provided** - use the named target directly. Still run the coverage cross-reference to flag any other gaps as an aside.
2. **On a feature branch with a plan** - read the plan file, identify what was implemented, use those files as the primary targets. Also surface any 🟥 items already in coverage.md.
3. **No argument, no active plan** - use the gaps found in step B as the target list. Show them to the user grouped by layer and ask which to tackle.

---

## Step 2: Detect the project type

Read the repo structure to understand what kind of project(s) exist. A repo may have multiple layers (e.g. a backend API and a frontend app).

Look for language and framework signals: solution or project files, package manifests, dependency files, config files. Read them to understand the stack - not just the language but the specific framework, since that determines which test library is appropriate.

**Detect all layers in the repo, not just one.** The test plan in Step 4 must cover every layer unless the user has explicitly scoped the request to a single target. If the target is ambiguous, note all layers and include them all in the plan.

---

## Step 3: Check test infrastructure

For each relevant layer, determine whether test infrastructure already exists - a test project, test config, or test dependencies.

If infrastructure exists, skip to Step 4.

If infrastructure is missing, tell the user what needs to be set up and ask for confirmation before creating anything. Do not create files or install packages without approval.

Once confirmed, set up the appropriate infrastructure for the detected project type using its standard conventions. Keep setup minimal - only what is needed to run tests.

---

## Step 4: Build the full test plan

The test plan lives in `docs/tests/coverage.md`. This is a single persistent file that
accumulates across all `/unit-test` sessions - it is the source of truth for what is
covered and what is not. Create the `docs/tests/` folder if it does not exist.

### Reading the plan

If `docs/tests/coverage.md` already exists, read it first. Items marked 🟩 are already
covered - do not re-test them unless the user asks. Items marked 🟥 are known gaps and
should be included in the current session's work.

### Writing or updating the plan

Before writing a single test, update `docs/tests/coverage.md` to include all targets
for the current session. Add new targets as 🟥 To Do. Show the relevant section to the user:

```
Test plan (docs/tests/coverage.md updated):

[Layer 1 - e.g. .NET backend]
- [ ] 🟥 [ClassName] - [behaviours to cover]
- [ ] 🟥 [ClassName] - [edge cases]

[Layer 2 - e.g. Next.js frontend]
- [ ] 🟥 [ComponentName] - [behaviours to cover]
- [ ] 🟥 [function] - [edge cases]

Does this look right? (yes / adjust / skip [layer])
```

Wait for confirmation before writing any tests.

### File format

```markdown
# Test Coverage

**Last updated:** [date]

---

## Coverage Report

> Updated by /unit-test each run.

### [Layer] - last run [date]

| Class/Component | Lines | Branches | Notes |
|---|---|---|---|
| [Name] | 100% | 100% | |
| [Name] | 92% | 94% | Lines 108-126 uncovered - [reason] |

---

## [Layer name - e.g. .NET Backend]

### [ClassName]
- [x] 🟩 [MethodName] - [what was tested]
- [ ] 🟥 [MethodName] - [what needs testing]

## [Layer name - e.g. Next.js Frontend]

### [ComponentName]
- [ ] 🟥 [behaviour] - [what needs testing]
```

### During execution

After each target is tested and passing, update its entry in `docs/tests/coverage.md`
from 🟥 To Do to 🟩 Done and check the checkbox. Do not wait until the end - update
as you go so the file always reflects the current state.

Do not stop until every item added in this session is checked off or explicitly skipped.

### What makes a good unit to test

**Good targets:**
- Functions or methods with conditional logic, branching, or error handling
- Public API surfaces: controllers, service methods, exported functions
- Edge cases: empty input, not-found, invalid state, boundary values

**Poor targets:**
- Simple passthrough functions with no logic
- Framework wiring and entry points
- Private implementation details that can change without affecting observable behaviour

---

## Step 5: Write the tests

Work through the plan layer by layer. For each layer:

1. Write the tests for that layer using the conventions of its framework.
2. Run the tests (Step 6) and confirm they pass before moving to the next layer.
3. Check off the completed items in the plan.
4. Continue to the next layer.

Do not finish the session until all layers in the plan are complete or explicitly skipped by the user.

Regardless of framework:

- Each test should cover one behaviour or scenario
- Tests must be independent - no shared mutable state between tests
- Name tests so they read as a description of the behaviour being verified
- Test behaviour from the outside, not internal implementation details
- Use the standard assertion library for the framework - prefer readable assertions
- For database-dependent code, use an in-memory or test database - do not mock the data layer directly

---

## Step 6: Run the tests with coverage

Run the test suite for each layer with coverage enabled, not just a plain test run.

Show the full output. If any tests fail, diagnose and fix before continuing.
Do not record coverage numbers from a run with failing tests.

After all layers pass, update the **Coverage Report** table at the top of
`docs/tests/coverage.md` with the new numbers. Update the "last run" date.
For each component record: statement %, branch %, line %, and any uncovered lines.
Note whether uncovered lines are genuine gaps or intentional skips.
Flag any component where branch coverage dropped compared to the previous recorded numbers.

Also verify the tests are meaningful - not just passing but actually asserting:
scan for any test that calls code under test but has no `expect` or assertion call.
If found, flag as a hollow test and fix before continuing.

---

## Step 7: Report

Summarise the results:

```
Unit tests written and passing.

[Layer]:
- [N] tests in [filename]
- Covers: [list of behaviours tested]

Not covered (and why):
- [Anything skipped, with a brief reason]

Next: run /review to check the feature code before shipping.
```

---

## Step 8: Commit

If test infrastructure was set up this session, commit it separately from the tests themselves - these are two distinct units of work.

Use clear commit messages that describe what was added.

---

## Edge cases

**Target has no testable logic** - note it and skip. Only test units with meaningful behaviour.

**Unit is too hard to isolate** - if a unit requires a full runtime environment to test meaningfully, note it in the report as an integration test candidate rather than forcing a fragile unit test.

**Running during a feature flow** - scope is the feature just built. Tests will be reviewed alongside feature code in `/review`.
