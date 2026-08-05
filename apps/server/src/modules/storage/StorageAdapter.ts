export interface StoredObjectMeta {
  originalFilename: string;
  mimeType: string;
}

/**
 * Storage backend for report PDFs. `LocalDiskStorageAdapter` is the
 * concrete implementation used today — files never sit behind a public
 * path; access always goes through the signed-token download route (see
 * lib/signedUrl.ts). An S3/R2-backed adapter is a drop-in behind this same
 * interface if/when object storage is set up — no caller changes.
 */
export interface StorageAdapter {
  save(buffer: Buffer, meta: StoredObjectMeta): Promise<{ storageKey: string; sizeBytes: number }>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}
