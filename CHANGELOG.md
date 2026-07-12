# Changelog

All notable changes to MOWC are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow the
`0.PHASE.BUILD` scheme described in ROADMAP.md.

## [Unreleased]

### Added
- docs/SECURITY.md: security contract adapted from ECTLogger's policy and
  expanded for MOWC's stack (threat model, zod boundary rules, session and
  CSRF design, sync/upload hardening, container hardening, per-phase
  security gates)
- AGENTS.md rules: security contract is part of Definition of Done; when
  offering to begin a phase, state the recommended model(s) and scope

## [0.0.1] - 2026-07-12

### Added
- Project foundation: README, MIT LICENSE (code only), .gitignore
- AGENTS.md rules of engagement (CLAUDE.md points to it), including the
  non-negotiable content-licensing rule, offline-first architecture rule,
  and the strict build-test-deploy workflow
- ROADMAP.md: Phases 0-10 with per-task Claude model recommendations
- docs/: ARCHITECTURE, DATA-MODEL, SYNC, DESIGN, LICENSING
