'use client';

import { useRef, useState } from 'react';
import { Camera, LoaderCircle, X } from 'lucide-react';
import { updateCoverPhoto } from '@/app/actions';
import { uploadMediaFile } from '@/lib/upload';

/**
 * Profile cover photo — upload from the device (no URL entry).
 *
 * Shows the cover image (or the default gradient), and when `editable` is
 * true a camera button to pick a photo from the device plus a remove button
 * to clear it back to the gradient.
 */
export default function CoverPhotoUpload({
  user,
  editable = false,
}: {
  user: any;
  editable?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<string>(user.coverPhoto || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
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
      setCover(media.url); // optimistic preview
      await updateCoverPhoto(media.url); // persist + revalidate
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError('');
    setCover('');
    await updateCoverPhoto('');
  };

  return (
    <div className="relative h-64 md:h-80 rounded-b-2xl overflow-hidden bg-gradient-to-br from-blue-400 to-indigo-500 group">
      {cover ? (
        <img src={cover} alt="Cover" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600" />
      )}

      {editable && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload cover photo"
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2 z-20">
            {cover && !uploading && (
              <button
                type="button"
                onClick={handleRemove}
                title="Remove cover photo"
                aria-label="Remove cover photo"
                className="w-10 h-10 bg-gray-800/70 hover:bg-gray-800 text-white rounded-full border-2 border-white/60 shadow flex items-center justify-center transition-colors backdrop-blur-sm"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Change cover photo"
              aria-label="Change cover photo"
              className="w-10 h-10 bg-gray-200/90 hover:bg-gray-300 rounded-full border-2 border-white shadow flex items-center justify-center text-gray-700 transition-colors disabled:opacity-70 backdrop-blur-sm"
            >
              {uploading ? (
                <LoaderCircle className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </button>
          </div>
          {error && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-64 text-center text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 z-20">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
