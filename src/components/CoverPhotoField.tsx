'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { uploadMediaFile } from '@/lib/upload';

/**
 * Settings-form field for the cover photo: upload from the device (no URL
 * entry). Persists through the classic hidden input (name={fieldName}) so
 * the existing updateProfile server action keeps saving it.
 */
export default function CoverPhotoField({
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
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your cover photo.');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const media = await uploadMediaFile(file);
      if (media.kind !== 'image') throw new Error('Cover photo must be an image.');
      setUrl(media.url);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative h-32 w-full rounded-lg overflow-hidden bg-gradient-to-br from-blue-400 to-indigo-600 border border-gray-200">
        {url ? (
          <img src={url} alt={`${userName} cover`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Upload cover photo"
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
          {uploading ? 'Uploading…' : url ? 'Change cover photo' : 'Upload cover photo'}
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
