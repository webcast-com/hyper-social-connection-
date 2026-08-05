'use client';

import { useState } from 'react';
import EmojiPicker from '@/components/EmojiPicker';
import { sendMessage } from '@/app/actions';

export default function MessageInput({ receiverId }: { receiverId: number }) {
  const [messageValue, setMessageValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  const handleEmojiSelect = (emoji: string) => {
    setMessageValue(prev => prev + emoji);
    setShowEmoji(false);
  };

  return (
    <form
      action={async (formData) => {
        formData.set('content', messageValue);
        await sendMessage(receiverId, formData);
        setMessageValue('');
      }}
      className="p-4 bg-white border-t border-gray-200"
    >
      <div className="flex space-x-2 relative">
        <div className="flex-1 flex items-center gap-1 relative">
          <input
            type="hidden"
            name="content"
            value={messageValue}
          />
          <input
            type="text"
            value={messageValue}
            onChange={(e) => setMessageValue(e.target.value)}
            placeholder="Type a message... 😎"
            className="flex-1 bg-gray-100 rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-24"
            required
          />
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="absolute right-10 top-1/2 -translate-y-1/2 text-xl hover:bg-gray-200 rounded-full p-1"
            aria-label="Emoji picker"
          >
            😊
          </button>
          {showEmoji && (
            <div className="absolute bottom-14 left-0 z-20">
              <EmojiPicker onSelect={handleEmojiSelect} />
            </div>
          )}
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white rounded-full p-3 w-11 h-11 flex items-center justify-center hover:bg-blue-700 transition-colors"
          aria-label="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </form>
  );
}