# Project Instructions for Claude

## Purpose of This Document

This document provides **context and collaboration guidelines for AI coding assistants** working in the Tasklog repository.

It explains:

- the purpose of the project
- the development philosophy
- how AI should assist during development
- which documents define system rules

AI assistants should read this file before proposing or implementing changes.

---

# Project Overview

**Tasklog** is a self-hosted task management application built as a personal alternative to subscription-based task apps.

The project began from a simple frustration: paying for a Todoist subscription for functionality that could be implemented independently.

Rather than recreating a full productivity platform, Tasklog focuses on building a **simple, understandable task system** that evolves over time.

The project is also intended to demonstrate **iterative software evolution** — starting from a minimal system and gradually expanding its capabilities.

---

# Origin Story

Tasklog started as a minimal system to replace a paid todo application.

The goals were:

- avoid recurring SaaS subscriptions
- retain full ownership of task data
- build something understandable end-to-end
- evolve the system gradually rather than designing everything upfront

Version 1 of Tasklog focused on proving that a simple system could work end-to-end:

- task creation
- viewing tasks
- deleting tasks
- optional deadlines
- SQLite storage
- local hosting accessible from phone and desktop

With this foundation complete, the project now moves toward **Version 2**, which will introduce a more structured architecture and improved user experience.

---

# Development Philosophy

The development philosophy for Tasklog emphasizes clarity and gradual evolution.

Key principles:

### Simplicity First

The system should remain understandable by a single developer.

Avoid unnecessary complexity and frameworks unless they clearly improve the system.

---

### Clarity Over Cleverness

Prefer readable, explicit solutions over clever or overly abstract designs.

Future maintainability is more important than short-term optimization.

---

### Incremental Evolution

The system should evolve version by version.

Major changes should happen in clearly defined phases rather than large uncontrolled rewrites.

---

### Ownership of the System

The goal is to understand the entire system:

- backend
- frontend
- database
- deployment

Design decisions should support that goal.

---

# AI Collaboration Rules

AI assistants (such as Claude Code) should follow these collaboration rules when contributing to the repository.

### Propose Before Implementing

For non-trivial changes:

1. Explain the proposed approach briefly.
2. Outline the implementation plan.
3. Then generate code if appropriate.

Large architectural changes should not be implemented without discussion.

---

### Respect Project Structure

When generating code:

- follow the architecture rules defined in the architecture document
- respect repository structure
- place logic in the correct layer

Do not introduce new structures without justification.

---

### Avoid Unnecessary Frameworks

Do not introduce additional frameworks or libraries unless there is a clear benefit.

The system should remain lightweight and understandable.

---

### Ask Questions When Requirements Are Unclear

If a task is ambiguous:

- ask clarifying questions
- do not guess requirements

Clear understanding is preferred over rapid implementation.

---

# Architecture Awareness

This repository contains additional documents that define system rules.

Important documents:

docs/product-design.md
docs/architecture.md
docs/engineering-guidelines.md

These documents define:

- product features
- system architecture
- coding conventions

When generating code, ensure implementations respect the constraints defined in these documents.

If a requested change conflicts with these rules, raise the issue before implementing.

---

# Coding Preferences

Code generated for this project should follow these preferences:

Prefer:

- clear naming
- small focused classes
- modular services
- readable code

Avoid:

- overly complex abstractions
- large monolithic files
- mixing responsibilities across layers

Code should prioritize **maintainability and clarity**.

---

# Communication Style

When assisting with development tasks:

1. Explain the approach briefly.
2. Provide a short implementation plan for complex changes.
3. Highlight architectural impacts if relevant.
4. Ask questions when requirements are unclear.

The goal is collaborative development rather than automatic code generation.

---

# Project Evolution

Tasklog evolves through versions.

### Version 1 (Completed)

A minimal system demonstrating end-to-end functionality.

Features included:

- task creation
- task viewing
- task deletion
- optional deadline
- SQLite persistence
- local hosting

---

### Version 2 (Current Focus)

Version 2 will restructure the system and expand its capabilities.

Planned improvements include:

- task completion lifecycle
- project grouping
- improved UI
- filtering and pagination
- clearer separation between backend API and frontend

---

# Final Guideline

Tasklog is intended to be:

- understandable
- maintainable
- incrementally evolving

Prefer solutions that are:

- simple
- modular
- aligned with the project philosophy

If a change affects system architecture or project structure, highlight the impact before implementing it.

---