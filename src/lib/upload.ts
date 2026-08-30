import { clientRejectsFile } from '@/lib/media-limits';

export type UploadedMedia = {
  url: string;
  kind: 'image' | 'video';
  type: string;
  size: number;
  name: string;
  storage?: 's3' | 'local';
};

export type UploadProgressInfo = {
  percent: number;
  loaded: number;
  total: number;
};

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function postFile(
  file: File,
  opts?: { onProgress?: (info: UploadProgressInfo) => void },
): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (!opts?.onProgress) return;
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      const loaded = event.loaded;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      opts.onProgress({ percent, loaded, total });
    };

    xhr.onload = () => {
      let data: Partial<UploadedMedia> & { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        opts?.onProgress?.({ percent: 100, loaded: file.size, total: file.size });
        resolve(data as UploadedMedia);
        return;
      }
      reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(body);
  });
}

type PresignResponse =
  | { mode: 'presigned'; uploadUrl: string; headers: Record<string, string>; filename: string; url: string }
  | { mode: 'direct' };

/** PUT the file straight at a presigned storage URL, reporting progress. */
function putToSignedUrl(
  file: File,
  target: { uploadUrl: string; headers: Record<string, string> },
  opts?: { onProgress?: (info: UploadProgressInfo) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);

    for (const [key, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (!opts?.onProgress) return;
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      opts.onProgress({ percent: total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0, loaded: event.loaded, total });
    };

    xhr.onload = () => {
      // Storage returns 200 or 204 (some providers also use 201) on success.
      if (xhr.status >= 200 && xhr.status < 300) {
        opts?.onProgress?.({ percent: 100, loaded: file.size, total: file.size });
        resolve();
        return;
      }
      reject(new Error(`Storage rejected the upload (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error('Upload failed — network or CORS error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
}

async function uploadDirectlyToStorage(
  file: File,
  opts?: { onProgress?: (info: UploadProgressInfo) => void },
): Promise<UploadedMedia | null> {
  const presignResponse = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  if (!presignResponse.ok) return null;

  const presign = (await presignResponse.json().catch(() => null)) as PresignResponse | null;
  // No object store configured (local disk driver) — use the proxied route.
  if (!presign || presign.mode !== 'presigned') return null;

  await putToSignedUrl(file, presign, opts);

  // The bytes skipped the server, so let it sniff what actually landed.
  const verifyResponse = await fetch('/api/upload/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: presign.filename }),
  });
  const verified = (await verifyResponse.json().catch(() => null)) as
    | (Partial<UploadedMedia> & { error?: string })
    | null;

  if (!verifyResponse.ok) {
    throw new Error(verified?.error || 'Upload was rejected after verification.');
  }

  return {
    url: verified?.url || presign.url,
    kind: (verified?.kind as UploadedMedia['kind']) || (file.type.startsWith('video/') ? 'video' : 'image'),
    type: verified?.type || file.type,
    size: verified?.size ?? file.size,
    name: file.name,
    storage: verified?.storage || 's3',
  };
}

/**
 * Client-side helper that stores a file and resolves with its media
 * descriptor. Throws on failure.
 *
 * Preferred path: presign → the browser PUTs straight to the object store →
 * the server verifies the stored bytes. Keeps large photos and video working
 * on platforms with small request-body caps (Vercel: 4.5 MB).
 *
 * Fallback: POST the bytes to `/api/upload`, which works when no object store
 * is configured or the bucket is not reachable from the browser (CORS). That
 * path is bounded by the platform's body limit.
 *
 * Size / type checks run here first so a 250 MB clip is not shipped only to
 * be rejected by the API.
 */
export async function uploadMediaFile(
  file: File,
  opts?: { onProgress?: (info: UploadProgressInfo) => void },
): Promise<UploadedMedia> {
  const reason = clientRejectsFile(file);
  if (reason) throw new Error(reason);

  try {
    const uploaded = await uploadDirectlyToStorage(file, opts);
    if (uploaded) return uploaded;
  } catch (error) {
    console.warn(
      '[upload] direct-to-storage upload failed, falling back to /api/upload:',
      (error as Error)?.message,
    );
  }

  return postFile(file, opts);
}
