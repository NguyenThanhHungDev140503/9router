# Phase 8: Database Schema & Hermes Repositories - Plan Index

| Plan ID | Title | Wave | Dependencies | Requirements Covered | Status |
|---|---|---|---|---|---|
| **08-01** | SQLite Database Schema & Migration 003 for Hermes & Swarm | Wave 1 | None | HERMES-01, HERMES-03, SWARM-01, SWARM-02, SWARM-03, MEMORY-01, MEMORY-02 | Ready |
| **08-02** | Hermes Repositories & Data Access Layer | Wave 2 | 08-01 | HERMES-01, HERMES-02, HERMES-03, SWARM-01, SWARM-02, SWARM-03, MEMORY-01, MEMORY-02 | Ready |

## Wave Execution Strategy
- **Wave 1 (Plan 08-01)**: Build the SQLite table definitions in `src/lib/db/schema.js`, write migration `003-hermes-swarm.js`, and test the migration chain against WAL mode SQLite.
- **Wave 2 (Plan 08-02)**: Implement data access repositories `hermesRepo.js`, `swarmRepo.js`, and `blackboardRepo.js` in `src/lib/db/repos/`, expose through `src/models/index.js`, and test full transactional query lifecycles.
