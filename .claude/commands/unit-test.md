# Unit Test

Write unit tests for a feature, a specific component, or the whole project.
Detects the project type first, then uses the appropriate framework and conventions.

Usage:
- `/unit-test` on a feature branch - infers what to test from the plan and changed files
- `/unit-test [target]` - targets a specific controller, component, or function by name
- `/unit-test` on main with no active plan - scans for coverage gaps and suggests targets

---

## Step 1: Resolve the target

Check the current branch and which files have changed since main.

Determine what to test using context in priority order:

1. **Argument provided** - use the named target directly.
2. **On a feature branch with a plan** - read the plan file, identify what was implemented, use those files as the primary targets.
3. **On main with no argument** - scan for source files that have no corresponding test file. Suggest the top candidates and ask the user which to focus on first.

---

## Step 2: Detect the project type

Read the repo structure to understand what kind of project(s) exist. A repo may have multiple layers (e.g. a backend API and a frontend app).

Look for language and framework signals: solution or project files, package manifests, dependency files, config files. Read them to understand the stack - not just the language but the specific framework, since that determines which test library is appropriate.

Only work on the layer(s) relevant to the current target. If the target is ambiguous across layers, ask the user which layer to test.

---

## Step 3: Check test infrastructure

For each relevant layer, determine whether test infrastructure already exists - a test project, test config, or test dependencies.

If infrastructure exists, skip to Step 4.

If infrastructure is missing, tell the user what needs to be set up and ask for confirmation before creating anything. Do not create files or install packages without approval.

Once confirmed, set up the appropriate infrastructure for the detected project type using its standard conventions. Keep setup minimal - only what is needed to run tests.

---

## Step 4: Identify what to test

List the specific units you plan to test before writing anything. Show it to the user:

```
I will write unit tests for:

- [ClassName or function] - [what behaviour or scenario this covers]
- [ClassName method] - [edge case or logic being tested]

Does this look right? (yes / adjust / skip)
```

Wait for confirmation.

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

Write tests using the conventions of the detected framework. Regardless of framework:

- Each test should cover one behaviour or scenario
- Tests must be independent - no shared mutable state between tests
- Name tests so they read as a description of the behaviour being verified
- Test behaviour from the outside, not internal implementation details
- Use the standard assertion library for the framework - prefer readable assertions
- For database-dependent code, use an in-memory or test database - do not mock the data layer directly

---

## Step 6: Run the tests

Run the test suite for the relevant layer using the project's standard test command.

Show the full output. If any tests fail, diagnose and fix before continuing. Do not move to Step 7 with a failing suite.

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
