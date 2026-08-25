'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { uploadMediaFile, type UploadProgressInfo } from '@/lib/upload';
import UploadProgress from './UploadProgress';

/**
 * Device upload (with progress) for a group cover photo. The chosen URL is
 * written back through `onChange` so the existing create/update group
 * actions keep saving `coverPhoto` unchanged.
 */
export default function GroupCoverField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgressInfo | null>(null);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for the group cover.');
      return;
    }

    setError('');
    setUploading(true);
    setProgress({ percent: 0, loaded: 0, total: file.size });
    try {
      const media = await uploadMediaFile(file, { onProgress: setProgress });
      if (media.kind !== 'image') throw new Error('Cover photo must be an image.');
      onChange(media.url);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative h-28 w-full rounded-xl overflow-hidden bg-gradient-to-br from-blue-400 to-indigo-600 border border-gray-200 dark:border-gray-700">
        {value ? (
          <img src={value} alt="Group cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600" />
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload group cover photo"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-100 transition-colors disabled:opacity-70"
        >
          {uploading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading…' : value ? 'Change cover' : 'Upload cover'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setError(''); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:hover:bg-red-900/30 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-100 transition-colors"
          >
            <X className="w-4 h-4" /> Remove
          </button>
        )}
      </div>

      {uploading && progress && <UploadProgress info={progress} label="Uploading cover photo…" />}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
