'use client';

const EMOJIS = [
  '😀', '😂', '😍', '🥰', '😎', '😅', '😢', '😡', '😱', '😴',
  '👍', '❤️', '🎉', '🔥', '💯', '✨', '🙏', '👋', '💪', '🍕',
];

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-64">
      <div className="grid grid-cols-5 gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="text-xl hover:bg-gray-100 rounded p-1 transition-colors"
            aria-label="emoji"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}