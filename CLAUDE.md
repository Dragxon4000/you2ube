# 🚨 MASTER DEVELOPMENT INSTRUCTIONS (FOLLOW FOR EVERY RESPONSE)

## Repository

Repository:
**[https://github.com/Dragxon4000/you2ube](https://github.com/Dragxon4000/you2ube?utm_source=chatgpt.com)**

You are working exclusively on this repository.

Before every task:

1. Clone/download the latest version of this repository.
2. Use this repository as the **single source of truth**.
3. Never create a new project.
4. Never assume code exists—inspect the repository first.
5. Read the entire repository before making architectural decisions.
6. Read `AUDIT_LOG.md` before changing anything.
7. If `AUDIT_LOG.md` does not exist, create it.
8. Reuse the existing repository instead of rewriting it.

---

# Audit First

Before writing any code:

* Inspect the repository.
* Read the relevant files.
* Explain what currently exists.
* Explain how it works.
* Explain what files will be modified.
* Explain why each file needs modification.
* Explain any architectural conflicts.
* Explain any risks.

If conflicting implementations are discovered:

STOP.

Explain the conflict before making changes.

Never silently replace code.

---

# Architecture Rules

Never create duplicate systems.

Never create:

* duplicate authentication
* duplicate providers
* duplicate utilities
* duplicate components
* duplicate routes
* duplicate APIs
* duplicate database models
* duplicate hooks

Always reuse or refactor existing implementations.

---

# Authentication Rules

The repository must contain **ONE** authentication architecture.

If Supabase Auth exists:

* reuse Supabase Auth
* reuse `auth.users`
* reuse `public.profiles`
* reuse existing middleware
* reuse existing RLS

Never introduce:

* custom users tables
* custom sessions tables
* bcrypt login systems
* parallel authentication

If authentication conflicts exist:

STOP.

Explain:

* the conflicting implementations
* which should remain
* why
* which files require modification

Only then continue.

---

# Database Rules

The existing database schema is the source of truth.

Never:

* invent tables
* invent columns
* invent foreign keys
* invent migrations

If application code references tables that do not exist:

Fix the application code.

Do not redesign the database.

Always verify queries against the schema.

---

# Existing Features

Before creating any feature:

Search the repository.

If a similar implementation exists:

Reuse it.

Never rewrite working code without justification.

---

# Code Quality

Maintain:

* architecture
* folder structure
* naming conventions
* TypeScript types
* coding style

Avoid unnecessary rewrites.

Avoid unnecessary dependencies.

---

# Documentation

After every task:

Update `AUDIT_LOG.md`.

Include:

* Date
* Task
* Repository status
* Files inspected
* Files modified
* Reason for every modification
* Architecture decisions
* Testing completed
* Remaining issues
* TODOs

---

# Response Format

Always return:

1. Repository Audit
2. Implementation Plan
3. Implementation Summary
4. Complete contents of every modified file
5. List of every file inspected
6. Updated `AUDIT_LOG.md`
7. Manual testing checklist

---

# Error Prevention

Never guess.

Never invent code.

Never invent database objects.

Never invent APIs.

Never invent authentication.

Never mix architectures.

Never silently delete features.

Never replace working code without explanation.

If an architectural conflict exists:

STOP.

Explain it first.

---

# Working Style

Always follow:

Audit → Explain → Plan → Implement → Test → Document

Do not skip any step.

Every task should leave the repository in a buildable, maintainable, and documented state.
