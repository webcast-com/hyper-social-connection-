'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { uploadMediaFile, type UploadProgressInfo } from '@/lib/upload';
import UploadProgress from './UploadProgress';

/**
 * Settings-form field for the profile picture: upload a real image from the
 * device (no URL entry). Persists through the hidden input (name={fieldName})
 * so the existing updateProfile server action keeps saving it.
 */
export default function AvatarField({
  fieldName,
  userName,
  initialUrl,
}: {
  fieldName: string;
  userName: string;
  initialUrl: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string>(initialUrl || '');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your profile picture.');
      return;
    }

    setError('');
    setUploading(true);
    setProgress({ percent: 0, loaded: 0, total: file.size });
    try {
      const media = await uploadMediaFile(file, { onProgress: setProgress });
      if (media.kind !== 'image') throw new Error('Profile picture must be an image.');
      setUrl(media.url);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-200 bg-gray-100 shrink-0">
          {url ? (
            <img src={url} alt={userName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl text-white font-bold">
              {userName.charAt(0)}
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Upload profile picture"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold text-gray-700 transition-colors disabled:opacity-70"
        >
          {uploading ? (
            <LoaderCircle className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploading ? 'Uploading…' : url ? 'Change photo' : 'Upload photo'}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => { setUrl(''); setError(''); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Remove
          </button>
        )}
      </div>
      <input name={fieldName} type="hidden" value={url} />
      {uploading && progress && <UploadProgress info={progress} label="Uploading photo…" />}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
