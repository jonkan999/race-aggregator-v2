# Cursor Prompt

## Project Context
I want you to help me rebuild and migrate an existing project into a more scalable architecture.

The current project lives at:
`/Users/jonkan/repos/race-aggragator`

It is a **static vanilla site**, and I want to migrate it into a system where:
- Some components remain **statically generated**
- Other parts (e.g. pagination, race listings beyond first page) are **dynamically served via Supabase**
- Here I think you will need to think hard about the map solution since i still want to be able to show all races on the map even though we have only generated on full page in the poagination

The goal is to make the site **cost efficient, scalable, and reusable across multiple markets**.

---

## Key Objectives

### 1. Analyze Existing Site
- Carefully go through how the current site works
- Ensure **all existing functionality and style is preserved**
- We are initially only targeting:
  - Swedish (local)
  - English (international)
- But it should easily be scalable to neighbouring markets
- Reference site behavior: https://loppkartan.se/

---

## Architecture & Migration Goals

### 2. Supabase Integration
- Set up initial Supabase structure:
  - Environment variables / API keys
  - Database schema for races
- Migrate race data from static `.json` files to:
  - A hybrid approach:
    - Dynamic Supabase-backed data
    - some sites pre rendered and statically served (if you thinik this is good architecturally)

---

### 3. Data Sources

#### Text / Content
- Must NEVER be hardcoded
- Must always come from:
  - `index.yaml` (per country)
  - Separate `index.yaml` for English/international

#### Race Data
- Currently sourced from `.json`
- All current country data and configs are in this location:
  /Users/jonkan/repos/race-aggregator/project-root/data/countries
  and here is an example of the full swedish content /Users/jonkan/repos/race-aggregator-v2/se
- Going forward:
  - Seed from existing repo
  - Then managed via:
    `/Users/jonkan/repos/race-collector-v2`

---

## Templating & Reusability

### 4. Template System
- Everything must be **fully templateable**
- Structure must support:
  - Multiple countries
  - Multiple languages
- Avoid duplication—design for reuse across markets

---

## Tooling & Automation

### 5. Playwright MCP
- Evaluate and set up **Playwright MCP**
- Use it for:
  - Interacting with the site
  - Testing flows
  - Validating functionality during migration

---

## Development Workflow Requirements

### 6. PRD (Product Requirements Document)
- Create and maintain a `PRD.md`
- Every significant change must:
  - Update the PRD
  - Reflect architectural decisions

---

### 7. README
- Continuously update `README.md`
- Every commit should:
  - Keep setup instructions current
  - Reflect structure and workflow changes

---

## First Task (Start Here)

1. Analyze the existing repo structure and summarize:
   - How the current site works
   - Key components and data flow

2. Propose a **new project structure** that includes:
   - Supabase integration
   - Static + dynamic separation
   - Template system
   - Localization setup (`index.yaml` strategy)

3. Set up:
   - Environment config (Supabase keys, etc.)
   - Initial database schema for races
   - Basic project scaffolding

4. Create:
   - Initial `PRD.md`
   - Updated `README.md`

---

## Constraints & Rules

- Do NOT hardcode any user-facing text
- Maintain full feature parity with current site
- Optimize for scalability and multi-market reuse
- Keep the system clean, modular, and maintainable

---

## Execution Notes

- Act decisively and structure the project step by step
- If anything is unclear, ask before proceeding