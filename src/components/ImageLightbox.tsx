'use client';

import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

export default function ImageLightbox({
  src,
  alt = 'Image preview',
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    // Prevent body scrolling while modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const zoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => Math.min(s + 0.3, 3));
  };

  const zoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => Math.max(s - 0.3, 0.7));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
    >
      {/* Control bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-4 z-50 flex items-center space-x-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-white"
      >
        <button
          type="button"
          onClick={zoomOut}
          className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-xs font-mono px-1">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={zoomIn}
          className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
          title="Open / Download original"
          aria-label="Open original image"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 hover:bg-red-500/50 rounded-full transition-colors ml-1"
          title="Close (Esc)"
          aria-label="Close lightbox"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-5xl max-h-[88vh] flex items-center justify-center overflow-hidden"
      >
        <img
          src={src}
          alt={alt}
          style={{ transform: `scale(${scale})`, transition: 'transform 0.15s ease-out' }}
          className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}
