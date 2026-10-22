import { createRoot } from 'react-dom/client';
import Navbar from '../../src/components/Navbar';
import Messages from '../../src/app/messages/page';
import Conversation from '../../src/app/messages/[id]/page';
import Notifications from '../../src/app/notifications/page';

declare global {
  interface Window {
    mobileReviewPath: string;
    renderMobileNavigation: (pathname: string, unread?: number) => Promise<void>;
  }
}
const root = createRoot(document.getElementById('root')!);
let key = 0;
window.renderMobileNavigation = async (pathname, unread = 12) => {
  window.mobileReviewPath = pathname;
  const content = pathname === '/messages' ? await Messages()
    : pathname.startsWith('/messages/') ? await Conversation({ params: Promise.resolve({ id: '2' }) })
      : pathname === '/notifications' ? await Notifications()
        : <div className="p-4"><h1 className="text-2xl">{pathname === '/' ? 'Home' : pathname.slice(1)}</h1><div className="h-[1500px]" /><button className="min-h-11">Last page action</button></div>;
  root.render(<div key={++key}>
    <Navbar user={{ id: 1, name: 'Test User' }} unreadCount={unread} />
    <main className="app-main app-surface max-w-7xl mx-auto">{content}</main>
  </div>);
};
void window.renderMobileNavigation(location.pathname);
