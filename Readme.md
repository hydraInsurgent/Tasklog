# Tasklog

Tasklog is a **minimal, self-hosted task application** built for personal use.

The project started for two simple reasons:
1. I didn’t want to keep paying for a Todoist subscription.
2. I wanted full control over my tasks, data, and code.

Rather than recreating an existing SaaS app, the goal was to build the **smallest useful system**, ship it end-to-end, and evolve it deliberately over time.

---

## Intention & Backstory

I rarely keep complex task systems up to date. Over time, feature-rich tools tend to become heavier instead of more helpful.

Tasklog is an experiment in the opposite direction:
- fewer concepts
- fewer decisions
- less ceremony

v1 focuses on **ownership and simplicity**, not productivity optimization.

---

## What Tasklog v1 is

- A single-user task log
- Server-rendered and easy to reason about
- Self-hosted on a local machine
- Accessible from both phone and desktop on the same network
- Backed by a local SQLite database

The emphasis is on **understanding the whole system**, not building a perfect task manager.

---

## Current Capabilities (v1)

- Create tasks with a title and optional deadline
- View all active tasks
- View a single task in a read-only detail page
- Delete tasks (delete = done)
- Persistent storage using SQLite
- End-to-end flow validated on real devices (phone + desktop)

v1 is intentionally small and complete for its original scope.

---

## Design Philosophy

- Ship something usable before optimizing
- Prefer clarity over abstraction
- Avoid premature features
- Treat this as a tool, not a product
- Let real usage guide evolution

---

## Tech Stack

- ASP.NET MVC
- Entity Framework Core
- SQLite
- Razor views (server-rendered)
- HTTP over local network

The stack was chosen to minimize friction and maximize understanding.

---

## Roadmap

Tasklog is intended to evolve incrementally. Planned future work is grouped into stages rather than individual features.

### v2 — Task Lifecycle & Organization
**Focus:** correctness and behavior.

Planned ideas:
- Mark tasks as completed using a checkbox
- Maintain a separate history of completed tasks
- Clarify delete semantics in the presence of completion
- Introduce basic task grouping (projects)

This phase is about defining a clear task lifecycle.

---

### v2.1 — Usability & Navigation
**Focus:** making the app more comfortable to use.

Planned ideas:
- Improved UI layout for mobile and desktop
- Table and card-based views
- Filtering and basic pagination
- Better visual separation of active vs completed tasks

---

### v3+ — Reliability & Power Features
**Focus:** resilience and convenience.

Exploratory ideas:
- Offline access using browser storage
- Sync strategies when the server becomes available
- Always-on hosting (e.g. Raspberry Pi)
- API-first architecture and richer frontend (if needed)

These are intentionally deferred until the core behavior proves useful.

---

## Status

**v1 is complete and stable.**

The project is now in an evolution phase rather than a build-from-scratch phase. New features will be added only when they solve a real usage problem.

---

## Notes

This project is primarily for personal use and learning.  
If it’s useful to someone else, that’s a bonus.
