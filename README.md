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

Add a PDF when creating a lecture, or attach/replace/remove it in lecture details. File selection validates the extension, supplied MIME type, and `%PDF-` header; this is basic format validation, not full PDF parsing or a security scan. Text extraction is available on demand through Process Lecture (see below); there is no rendered PDF viewer. Replacing a PDF creates a new document ID, while the lecture ID remains stable. Metadata updates, binary insertion, and obsolete binary removal commit in one transaction. Repeated metadata edits do not rewrite existing blobs.

`LibraryRepository` in `src/library/storage.ts` exposes `load`, `save`, and `getPdf(fileId)`. Document processing retrieves `{ metadata, blob }` without depending on React. A backend adapter can implement the same contract. `useLibrary.ts` owns hydration, serialized saves, retries, and UI save/error state. New file binaries exist in memory until the transaction completes; persisted lecture snapshots contain metadata only.

Opening failures block editing so unreadable data cannot be replaced by a fresh seed. Failed saves retain edits in memory, show an error/retry action, and register a leave-page warning. Keep the page open until saving succeeds; warnings depend on browser support and cannot prevent every forced shutdown. Missing binaries are reported in lecture details without deleting the associated lecture or objectives. Replace or remove the missing attachment to resolve it.

Concurrent tabs use revision checks to prevent silent last-writer-wins overwrites. There is no automatic cross-tab merge. A stale tab retains its unsaved changes and reports a conflict; copy those edits before reloading and continue in one tab.

### Demo data

Generic demos contain no medical knowledge. They are explicitly tagged `isDemo` with demo status provenance, and dashboard lecture counts exclude them. Future analytics must continue excluding demo records. The seed runs only when no saved library exists. **Remove demo lectures** persists the removal and retains user lectures, including those sharing demo organization. Set `INCLUDE_DEMO_DATA` to `false` in `src/library/demo.ts` to disable seeding for new databases; it does not delete an existing library. No workspace course PDFs or tutoring records are imported.

### Limits and schema evolution

Storage belongs to this browser profile and site origin (scheme, host, and port). It does not sync across devices or origins. Clearing site data deletes the library; private browsing may discard it on exit. Quotas vary, and browsers may evict local data under storage pressure. This prototype has no export/backup or remote recovery, and does not promise permanent archival storage. The prior in-memory version had no saved data to migrate after a refresh.

Increment the IndexedDB version and implement explicit `onupgradeneeded` migrations for future schema changes; never delete/recreate a user's database to upgrade it. Unsupported future versions fail opening instead of silently resetting data.

### Data model and tests

`src/library/models.ts` defines Lecture, LearningObjective, Course, CourseModule, Exam, StudyStatus, PdfDocument, and LibrarySnapshot. Relationships use stable IDs. Objectives distinguish manual entry from accepted PDF provenance (document ID and page). `data.ts` contains immutable domain operations; `pdf.ts` performs basic file validation. UI components use the state/repository abstractions rather than IndexedDB calls.

Tests cover record and objective restoration, selections, PDF metadata/binary retrieval, replacement/removal, missing files, stale-write rollback, save failure/retry, and simulated app remounts. `fake-indexeddb` is a development-only IndexedDB implementation for Node tests; Node type definitions support native Blob/File test fixtures. No production storage dependency was added. Tests simulate reloads; they are not a guarantee against browser eviction or forced process termination.

## PDF processing and source content

Attach a PDF, wait for its save to finish, then open its lecture and click **Process Lecture**. The detail page shows processing state, pages read, source chunks, objective-suggestion count, processing date, and extraction warnings. Expand **Inspect source pages** to compare raw extracted text, whitespace-normalized text, and that page's chunks. PDF page numbers are one-based physical PDF pages, not the slide numbers printed on them.

### Parser and local assets

Mozilla **PDF.js** (`pdfjs-dist`, Apache-2.0) was chosen for its mature browser parser, per-page text API, worker support, and Vite-compatible distribution. Lightweight readers generally provide less reliable PDF font/encoding handling, while server tools would require the backend excluded from this feature. The compatibility build avoids relying on the newest browser typed-array APIs. Its parser and worker are loaded only when processing starts.

`predev`, `pretest`, and `prebuild` run `scripts/prepare-pdf-assets.mjs`, copying matching-version standard fonts, character maps, and WASM assets into the ignored `public/pdfjs/` directory. Vite serves/copies these locally and bundles the worker. No runtime CDN or external medical data is used. Keep these assets when deploying the production build. Use Node 24 LTS; PDF.js requires at least Node 22.13 if using Node 22.

### Processing architecture and provenance

`src/processing/` separates parsing, content transformations, service orchestration, retrieval, typed models, and presentation:

1. `service.ts` retrieves a stored blob by stable file ID and verifies its lecture association.
2. `pdfjs.ts` reads every page sequentially through PDF.js, keeping explicit failed-page entries and reporting progress.
3. `content.ts` preserves raw extracted text alongside whitespace-only normalization. It never repairs wording or adds facts.
4. Each `LecturePage` has stable file/page ID, lecture ID, file ID, physical page number, both texts, and extraction state/warnings.
5. `SourceChunk` IDs include the file/page and normalized character offsets. Chunks are at most 1,000 characters, split near spaces, **never cross a page**, and retain a `SourceReference` with lecture/file IDs, page numbers and page IDs. No source page is omitted from the page list merely because extraction was empty or failed.
6. `ProcessedLecture` records include pipeline version, filename, timestamp, pages, chunks, and objective suggestions. They are persisted with the structured library snapshot using the existing atomic IndexedDB saves and revision checks. This additive optional field is backward-compatible with existing v1 snapshots; it does not require recreating the database.

`searchSources(data, selectedLectureIds, query)` is the retrieval boundary. A nonempty explicit scope and query are required. It returns only selected, non-demo lectures whose current PDF matches a successfully processed record, and verifies page references and chunk text against the captured page. No empty-scope or global fallback exists. Library source search uses selected lecture IDs, matches all whitespace-separated query terms case-insensitively, and shows up to 50 matching chunks with links to their source page. This is in-memory text matching, not semantic/vector search or a database search index.

### Objective suggestions

Heading/pattern detection recognizes Learning Objectives, Objectives, At/By the end of this lecture/session, and Students should be able to. It proposes following text lines, strips list markers, and stops at some common section headings. This is deliberately preliminary: wrapped lines, unusual headings, or slide footers can yield incomplete or extra candidates. It never invents objectives from outside knowledge.

Suggestions are pending until the student inspects the source and chooses **Accept objective** or **Dismiss**. Acceptance preserves manual objectives, avoids exact duplicates, and records file/page provenance and original suggested wording. Editing accepted wording is labeled Edited; its original provenance remains. Reprocessing the same file retains accepted/dismissed decisions. Stale suggestions cannot be accepted.

### Replacement, removal, failure and limitations

Replacing a PDF immediately makes its old processed content stale and excludes it from retrieval. Reprocessing creates a separate record for the new file; previous extracted versions remain inspectable in the source-version selector. Removing a PDF archives its sources and excludes them from search, while retaining accepted/manual objectives. Old PDF binary files are removed by the existing file-management transaction; archived extracted text is not a retained copy of the original PDF. Accepted objectives from older files are labeled Previous PDF.

A failed reprocessing attempt retains previously captured sources for inspection but excludes that failed record from retrieval. Unreadable PDFs show Processing failed and can be retried. Empty pages, page-level failures, and pages with fewer than 40 normalized characters are flagged separately. A document can be Processed while some pages are empty or failed: this means the extraction pass finished, **not** that every medical detail was captured. No automatic OCR, diagram interpretation, table reconstruction, or LLM repair is performed. Reading order, multi-column layouts, ligatures, symbols, and encodings may be imperfect even on pages without a warning; verify important passages against the original PDF.

Processing runs while the app is open. Closing/reloading before completion cancels unsaved progress; reopen and retry. Captured records survive reloads after IndexedDB saving succeeds. Large files can use substantial browser memory; all processed records currently load with the library snapshot. The existing browser quota/eviction and lack-of-backup limits apply to extracted content too.

Tests include a real PDF.js parse of a synthetic multi-page PDF, damaged documents, page/chunk provenance, scoped retrieval, empty/failed pages, suggestion review, preservation of manual objectives, storage restoration, and stale/archive behavior. UI tests use a controlled extractor to exercise review and recovery workflows without relying on an LLM. The fixture includes no medical lecture content.

## Scope

AI question generation, quizzes, OCR, spaced repetition, authentication, analytics, and a remote backend are not implemented. Dashboard lecture counts exclude demo lectures; question counts remain zero and accuracy is unassessed. Adding objectives does not generate questions.

Commit `package-lock.json` and use `npm ci` to reproduce dependencies. The repository `.npmrc` puts npm’s cache in `/tmp/sgu-study-npm-cache` because the cloud home directory is read-only. No environment variables or credentials are needed. Keep uploaded lecture PDFs and personal study records out of source control unless explicitly requested.
