export type UploadedMedia = {
  url: string;
  kind: 'image' | 'video';
  type: string;
  size: number;
  name: string;
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

/**
 * Client-side helper that sends a file to the shared upload endpoint
 * and resolves with the stored media descriptor. Throws on failure.
 *
 * Uses XHR so video (and large image) uploads can report real progress.
 */
export function uploadMediaFile(
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
