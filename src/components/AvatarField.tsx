'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Upload } from 'lucide-react';
import { uploadMediaFile } from '@/lib/upload';

/**
 * Settings-form field for the profile picture: keeps the classic URL input
 * (name={fieldName}) and adds a real file-upload button that fills it in.
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
    try {
      const media = await uploadMediaFile(file);
      if (media.kind !== 'image') throw new Error('Profile picture must be an image.');
      setUrl(media.url);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
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
          {uploading ? 'Uploading…' : 'Upload photo'}
        </button>
      </div>
      <input
        name={fieldName}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… or upload a photo above"
        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
