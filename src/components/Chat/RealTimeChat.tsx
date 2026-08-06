'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';

export default function RealTimeChat() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-chat')
      .on('broadcast', { event: 'message' }, (payload) => {
        setMessages((prev) => [...prev, payload.payload?.text || '']);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div>
      <h3>Real-time Chat</h3>
      <ul>{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
    </div>
  );
}
