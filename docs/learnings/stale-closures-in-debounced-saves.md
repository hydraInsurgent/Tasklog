# Stale closures in debounced saves

**Last updated:** 2026-07-04 - first encountered in Journaling (#79, v3.0.0)

Any autosave built on a debounce timer has to answer two questions when the timer finally fires: WHAT am I saving, and WHERE does it go? If either answer is looked up at fire time instead of captured at schedule time, the save can pair fresh data with a stale destination (or vice versa) whenever the user changes context inside the debounce window. In Tasklog this surfaced as a Block-severity review finding: typing on one day's journal and switching dates within 800ms wrote the new day's content onto the old day's entry - erasing it entirely if the new day was blank.

## Mental model

A scheduled callback (a `setTimeout`, a promise continuation, an event handler) is a message to the future. Everything the future action needs must travel INSIDE the message. Anything it instead reads from shared mutable state on arrival - a ref, a module variable, "the current selection" - may have changed since the message was sent. The bug class is a mixed capture: one input frozen at schedule time (the closure captured the date) and another read live at fire time (the ref held whatever content was loaded by then). Each half looks correct in isolation; the pair is inconsistent.

## Why it exists / what problem it solves

Debouncing exists to coalesce a burst of events (keystrokes) into one action (a save), which requires deferring work - and deferred work in a garbage-collected language runs inside a closure. Closures capture variables, not values: a captured `ref.current` or `this.state` is a live pointer into whatever the program mutated in the meantime. The temptation to read state at fire time is real: it guarantees you save the LATEST content, which is exactly right while the context is stable, and exactly wrong the moment the context (document, date, record id) changes underneath the pending timer. React sharpens the trap: state values in a component closure are frozen per render, so developers reach for refs to "always see the latest," recreating the mixed-capture hazard deliberately.

## How it actually works

```
 t=0     user types on Day A          schedule(save, 800ms)
                                      closure captures: date = A
 t=50    user taps Day B in calendar
 t=90    Day B's fetch resolves       sharedContent = B's content   (or {} if blank)
 t=800   timer fires                  PUT /entries/A  body = sharedContent  <- B's data onto A
```

The fix is to make the message self-contained: snapshot every input when scheduling.

```
 t=0     user types on Day A          snapshot = {date: A, content: A's draft}
                                      schedule(() => PUT(snapshot), 800ms)
 t=800   timer fires                  PUT /entries/A  body = A's draft      <- correct
```

Because the timer is reset on every keystroke, the last snapshot is always the latest edit - freshness is preserved without reading anything at fire time. A stale-context timer that survives a switch now does something useful: it persists the edit the user made, to the place it belongs.

## Common misconceptions

- "Reading through a ref at fire time is safer because it always sees the latest value." Latest CONTENT paired with a stale DESTINATION is precisely the corruption; latest is only correct when every coupled input is equally latest.
- "The debounce window is too short for the user to hit this." A local fetch resolves in tens of milliseconds; an 800ms window is an eternity. This was the common path, not a rare race.
- "Cancelling pending timers on context switch fixes it." It prevents the corruption but discards the user's last edit - a smaller bug replacing a bigger one. Snapshotting saves the edit AND targets it correctly. (Cancel-on-switch is a valid addition, not a substitute.)
- "React's stale-closure problem is about missing dependency arrays." That is one flavor. The inverse flavor - deliberately bypassing frozen state with refs and reading them later - causes this bug while looking like the fix for the first one.
- "Computing the snapshot inside a `setState` updater guarantees it runs before scheduling." State updaters run when React processes the update, not synchronously at call time; passing a variable the updater will assign to `setTimeout` can capture its pre-update value. Compute the snapshot from a synchronously-maintained source, then schedule.

## When it matters in practice

- Autosave in any multi-document editor where the user can switch documents, tabs, dates, or records while a save is pending (the Tasklog journal case).
- Debounced search boxes that attach filters read at fire time: the query text from one context paired with another context's filter.
- "Optimistic update then reconcile" flows where the reconcile callback reads current list state that a background poll may have replaced.
- Upload or submit handlers that read form state on completion of an async precondition (token refresh, validation call) after the user has navigated.
- Any queue worker that dequeues an id and then loads "the current" payload for it from a cache that other writers mutate.

## Further reading

- MDN, Closures: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures
- React docs, "Referencing values with refs" (the escape-hatch warning): https://react.dev/learn/referencing-values-with-refs
- React docs, "State as a snapshot": https://react.dev/learn/state-as-a-snapshot
