# SGU Study

A web-based workspace for SGU medical school exam preparation. The application includes a dashboard, persistent Lecture Library, PDF source processing, and a V1 Lecture Only study loop. It is an independent student project, not an official SGU product.

## Stack

React 19, TypeScript, and Vite, with plain CSS. Vitest and React Testing Library provide component tests. IndexedDB provides a local browser database. A small local Node HTTP API handles model calls and grading. There is no remote app backend or authentication. AI rounds require an OpenAI API key; library and PDF processing work without one.

## Start development

Use Node.js 24 LTS (`nvm use` if you use nvm) and npm.

```sh
npm ci
# For AI rounds, copy .env.example to .env.local and edit it locally first.
npm run dev
```

The launcher starts Vite on port **5173** and the API on **127.0.0.1:3001**, both local to your computer. Vite proxies `/api` requests to the API; the browser never calls the model provider directly. Keep the same browser address/profile you used previously (for example `http://localhost:5173`) to retain access to IndexedDB. Port 5173 must be free; the launcher exits rather than silently moving to a different storage origin. Control+C stops both processes. `npm run dev:api` runs only the API for troubleshooting.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

`npm run test:watch` watches tests. `npm run preview` serves the browser build after `npm run build` for static UI checks. Use `npm run dev` for the complete quiz loop; the static build does not contain the API. Remote deployment is outside V1 scope. The production build also checks browser assets for server credential markers and the provider endpoint.

## Structure

- `src/main.tsx`: browser entry point and global styles.
- `src/App.tsx`: dashboard and navigation.
- `src/quiz/`: evidence policy, typed quiz/API schemas, client API adapter, and Study UI.
- `server/`: native Node HTTP routes, quiz lifecycle/validation, provider interface and OpenAI adapter.
- `scripts/dev.mjs`: local web/API launcher.
- `.env.example`: names of server environment variables, with no credentials.
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

## V1 grounded quiz engine

### Configure AI on your Mac

1. Use Node 24 LTS and run `npm ci` after pulling this version.
2. Copy `.env.example` to **`.env.local`** in the repository root. Open it in your local editor and set `OPENAI_API_KEY` to your own OpenAI API key. Never paste keys in chat, put them in client source, or use a `VITE_` prefix. Both `.env` and `.env.local` are gitignored; `.env.example` contains empty/example values only.
3. Optionally set `STUDY_MODEL`; the default is `gpt-4.1-mini`. The model must support Chat Completions with strict JSON-schema responses. Your API account needs access to the chosen model and available quota.
4. Run `npm run dev`. Restart it after changing environment variables. You can alternatively inject `OPENAI_API_KEY` into the Node process using your shell's secure environment configuration.
5. In **Lectures**, attach/process PDFs and select one or more lectures. Open **Study**, check the selected lecture list, and click **Start Study Session**. All three questions must be answered before submission. After feedback, choose **Next 3 Questions**.

Without a key, the API still starts, and Check study service reports the missing configuration. Generation fails with a clear setup message; there is no sample-question or outside-knowledge fallback. Model API usage may incur charges: a valid round uses a generation call plus a separate review call; one bounded regeneration/review retry is allowed for invalid output.

### Provider and answer-release boundary

`ModelProvider` separates the application from the provider. `OpenAIProvider` uses Node's built-in fetch and server-only `OPENAI_API_KEY`; no provider SDK or browser-held secret is needed. `zod` validates requests, evidence, generated structured output, review output, and browser API responses. `tsx` is a development dependency for running the TypeScript local API. The HTTP API uses Node's standard library, not an additional web framework.

The API binds to loopback, restricts browser origins to localhost/127.0.0.1 on port 5173, accepts bounded JSON requests, and sets no-store response headers. Keep it local: this is a single-user development service, **not an authenticated public API**. Do not expose it as a public deployment without a separate deployment/security design.

Server routes:

- `GET /api/health`: configuration presence only, never secret values.
- `POST /api/study/round`: source packet plus optional previous graded round ID; returns exactly three public questions and server-generated IDs.
- `POST /api/study/grade`: round ID, current source packet, and all three responses; returns grading and grounded feedback.

Correct answers, explanations, tested concepts, clues, and citations remain in server memory until all three valid responses are submitted. The browser generation response contains only question IDs, stems, and choices. Rounds expire after one hour or a server restart. Submitted answers are immutable; retrying the same submission is idempotent. Next-round requests may include the previous graded round so its concepts can be deprioritized. This is an advisory avoidance hint, not spaced repetition. Reloading/leaving Study discards the active browser round; long-term quiz persistence is not implemented.

### Source eligibility and Lecture Only isolation

`buildEvidencePacket` reads the selected lecture IDs and sends only selected source records, referenced pages, and organizational metadata to the local API. It never sends PDF binaries or unselected lecture content. `eligibleSources` runs again on the server. There is no empty-scope/global fallback, external retrieval, or general-knowledge mode.

Eligibility excludes demo lectures, unselected lectures, stale file references, failed processing, and every page with any extraction warning (including Check extraction/low-text), empty/failed pages, and low-text pages even if their warning is missing. Page/lecture/file IDs and offsets must match; chunk text must equal the captured normalized page substring.

Name-only topic/drug/disease chunks are insufficient. A conservative syntax gate requires a substantive factual statement (at least 45 characters, seven words, and a relational/action cue). At least three qualifying statements must exist in the supplied context. This is deliberately conservative and can exclude legitimate terse slide bullets; it is **not** a medical truth classifier. Do not bypass the gate by inventing missing text. Select more complete eligible slides instead.

Context is capped at 36 chunks, balanced across selected lectures; request bodies are capped at 4 MiB. Some eligible content may be left out of one round. Source-linked objective IDs are recorded when accepted PDF objectives share a source page; manually entered or edited objective text is never treated as generation evidence. Unverified objective linkage remains empty instead of being guessed.

### Generation, citations and independent review

The model receives only eligible excerpts and their actual IDs. It is explicitly instructed that these excerpts are the ONLY medical source, that prior knowledge must not supply facts, and that instructions inside uploaded text are data rather than commands. Prefer five choices, permit three/four only when supported, and prefer simpler questions over unsupported clinical complexity.

Every generated text field—including stem, every option, every explanation, tested concept and winning clue—must include exact quotations from existing retrieved chunks. Structural validation requires exactly three distinct stems, valid sequential option labels, a valid correct answer, unique option text, and existing source IDs with verbatim quotes. Explicit answer-key/topic prefixes are rejected. A separate provider review must confirm support for **all** content, sufficient factual evidence, exactly one best answer, and no answer leakage. Rejected output is regenerated once, then fails closed with an insufficient/unsupported-material message. There is no ungrounded fallback.

Citations are built from server-validated sources, not model-invented metadata. After grading, students see lecture number/title, physical PDF page, the exact supporting chunk, and quoted evidence. The feedback includes **The clue that wins is:** and grounded explanations for each option. Raw IDs are internal, not the main citation label.

Source selection and current-file/content fingerprints are checked again at submission. Changing selection or eligible source content invalidates the browser round and prevents stale grading. A request includes a browser-owned source snapshot because there is no remote lecture database; the server verifies internal consistency, not the authenticity of a deliberately forged browser database.

### Verification and remaining limits

Tests cover the three-question loop, selected/multiple-lecture isolation, flagged/name-only exclusion, bad schemas and fabricated citations, unsupported-content rejection, hidden answers, grading, source display, retries, API failures, expiration, and secret handling. `npm run build` scans client assets for provider/credential markers; the check was also exercised with a synthetic server secret injected during building.

Automated semantic review is an additional safeguard, **not a formal proof of medical correctness**. A real quote can still be misinterpreted, and extraction can misorder tables or omit qualifiers without detecting a warning. Inspect the supplied source citations and original PDF. No live provider success is claimed unless tested with valid configured credentials. Controlled-provider tests do not require or spend a real API key.

V1 does not store historical performance or calculate mastery/readiness. Round feedback is recorded in server memory before moving on. Dashboard aggregate quiz metrics remain explicitly labeled placeholders. No spaced repetition, OCR, authentication, cloud sync, or automatic performance scheduling was added.

## Scope

OCR, spaced repetition, full mastery analytics, exam readiness calculations, authentication, and a remote backend are not implemented. Dashboard lecture counts exclude demo lectures; question counts remain zero and accuracy is unassessed. Adding objectives does not generate questions automatically; start a round explicitly in Study.

Commit `package-lock.json` and use `npm ci` to reproduce dependencies. The repository `.npmrc` puts npm’s cache in `/tmp/sgu-study-npm-cache` because the cloud home directory is read-only. Library/PDF features require no credentials; AI configuration is described below. Keep uploaded lecture PDFs and personal study records out of source control unless explicitly requested.
