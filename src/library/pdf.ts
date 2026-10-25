// Header validation only; this does not parse or extract PDF content.
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}
export async function validatePdf(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
    throw new Error('Choose a PDF file.');
  }
  const bytes = new Uint8Array(await readBlob(file.slice(0, 5)));
  if (String.fromCharCode(...bytes) !== '%PDF-') throw new Error('This file does not have a valid PDF header. Choose another PDF.');
}
