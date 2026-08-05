export type UploadedMedia = {
  url: string;
  kind: 'image' | 'video';
  type: string;
  size: number;
  name: string;
};

/**
 * Client-side helper that sends a file to the shared upload endpoint
 * and resolves with the stored media descriptor. Throws on failure.
 */
export async function uploadMediaFile(file: File): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed');
  return data as UploadedMedia;
}
