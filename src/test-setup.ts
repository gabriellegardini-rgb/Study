import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Blob, File } from 'node:buffer';

// Native Blob/File preserve structured-clone semantics in IndexedDB tests.
vi.stubGlobal('Blob', Blob);
vi.stubGlobal('File', File);
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));

afterEach(cleanup);
