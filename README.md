# SGU Study

A web-based workspace for SGU medical school exam preparation. The application includes a dashboard and a Lecture Library for organizing lectures and manually entered learning objectives. It is an independent student project, not an official SGU product.

## Stack

React 19, TypeScript, and Vite, with plain CSS. Vitest and React Testing Library provide component tests. IndexedDB provides a local browser database. There is no remote backend, authentication, or external API requirement.

## Start development

Use Node.js 24 LTS (`nvm use` if you use nvm) and npm.

```sh
npm ci
npm run dev
```

Vite prints the development address. The server binds to all interfaces for cloud development. Use `npm run dev -- --port 5173 --strictPort` for a predictable port.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

`npm run test:watch` watches tests. `npm run preview` serves the production build after `npm run build`; it is for local verification, not a production deployment server.

## Structure

- `src/main.tsx`: browser entry point and global styles.
- `src/App.tsx`: initial dashboard.
- `src/styles.css`: responsive styles without a UI framework.
- `src/App.test.tsx`: dashboard behavior and empty-state tests.
- `vite.config.ts`: Vite and test configuration.
- `AGENTS.md`: guidance for future contributors and coding agents.

## Lecture Library

Open **Lectures** to browse cards grouped by course and module. Search by title, number, professor, course or module; filter by study status. Add a lecture with a positive whole lecture number, title, course, module, optional professor/exam association, and optional PDF. Existing course/module/exam names are reused within their course; IDs remain stable across edits and reloads.

Open a lecture to add, edit, delete, and mark objectives reviewed. Editing objective text resets its reviewed flag. Objective review progress is counted directly from these flags and does not imply mastery. Study status is manually self-assessed, not calculated performance. Quiz performance, weak concepts, notes, and question history are explicitly planned empty states.

Select individual lectures or all lectures in a module. Module selection includes all lectures in that module even when search/status filters hide some cards. Selection and library changes survive navigation, page refreshes, and normal browser restarts after a successful save.

### Browser storage and PDFs

The app uses **native IndexedDB** because it stores structured records and large binary blobs asynchronously without localStorage's small string-only storage limits. Nothing is sent to a server or placed in localStorage.

Database `sgu-study-library`, schema version 1, contains:

- `state`: the structured library snapshot (lectures, objectives, courses, modules, exams, self-assessed status, and selected lecture IDs), plus an optimistic revision counter.
- `pdfs`: PDF blobs keyed by stable file ID, with original filename, MIME type, byte size, ISO upload timestamp, and associated lecture ID. Lecture records retain metadata references, not embedded PDF binary data.

Add a PDF when creating a lecture, or attach/replace/remove it in lecture details. File selection validates the extension, supplied MIME type, and `%PDF-` header; this is basic format validation, not full PDF parsing or a security scan. No PDF text is extracted and there is no PDF viewer. Replacing a PDF creates a new document ID, while the lecture ID remains stable. Metadata updates, binary insertion, and obsolete binary removal commit in one transaction. Repeated metadata edits do not rewrite existing blobs.

`LibraryRepository` in `src/library/storage.ts` exposes `load`, `save`, and `getPdf(fileId)`. Future document processing can retrieve `{ metadata, blob }` without depending on React. A backend adapter can implement the same contract. `useLibrary.ts` owns hydration, serialized saves, retries, and UI save/error state. New file binaries exist in memory until the transaction completes; persisted lecture snapshots contain metadata only.

Opening failures block editing so unreadable data cannot be replaced by a fresh seed. Failed saves retain edits in memory, show an error/retry action, and register a leave-page warning. Keep the page open until saving succeeds; warnings depend on browser support and cannot prevent every forced shutdown. Missing binaries are reported in lecture details without deleting the associated lecture or objectives. Replace or remove the missing attachment to resolve it.

Concurrent tabs use revision checks to prevent silent last-writer-wins overwrites. There is no automatic cross-tab merge. A stale tab retains its unsaved changes and reports a conflict; copy those edits before reloading and continue in one tab.

### Demo data

Generic demos contain no medical knowledge. They are explicitly tagged `isDemo` with demo status provenance, and dashboard lecture counts exclude them. Future analytics must continue excluding demo records. The seed runs only when no saved library exists. **Remove demo lectures** persists the removal and retains user lectures, including those sharing demo organization. Set `INCLUDE_DEMO_DATA` to `false` in `src/library/demo.ts` to disable seeding for new databases; it does not delete an existing library. No workspace course PDFs or tutoring records are imported.

### Limits and schema evolution

Storage belongs to this browser profile and site origin (scheme, host, and port). It does not sync across devices or origins. Clearing site data deletes the library; private browsing may discard it on exit. Quotas vary, and browsers may evict local data under storage pressure. This prototype has no export/backup or remote recovery, and does not promise permanent archival storage. The prior in-memory version had no saved data to migrate after a refresh.

Increment the IndexedDB version and implement explicit `onupgradeneeded` migrations for future schema changes; never delete/recreate a user's database to upgrade it. Unsupported future versions fail opening instead of silently resetting data.

### Data model and tests

`src/library/models.ts` defines Lecture, LearningObjective, Course, CourseModule, Exam, StudyStatus, PdfDocument, and LibrarySnapshot. Relationships use stable IDs. Objectives distinguish manual entry from future PDF provenance (document ID and page). `data.ts` contains immutable domain operations; `pdf.ts` performs basic file validation. UI components use the state/repository abstractions rather than IndexedDB calls.

Tests cover record and objective restoration, selections, PDF metadata/binary retrieval, replacement/removal, missing files, stale-write rollback, save failure/retry, and simulated app remounts. `fake-indexeddb` is a development-only IndexedDB implementation for Node tests; Node type definitions support native Blob/File test fixtures. No production storage dependency was added. Tests simulate reloads; they are not a guarantee against browser eviction or forced process termination.

## Scope

AI question generation, PDF text/objective extraction, spaced repetition, authentication, analytics, and a backend are not implemented. Dashboard lecture counts exclude demo lectures; question counts remain zero and accuracy is unassessed. Adding objectives does not generate questions.

Commit `package-lock.json` and use `npm ci` to reproduce dependencies. The repository `.npmrc` puts npm’s cache in `/tmp/sgu-study-npm-cache` because the cloud home directory is read-only. No environment variables or credentials are needed. Keep uploaded lecture PDFs and personal study records out of source control unless explicitly requested.
