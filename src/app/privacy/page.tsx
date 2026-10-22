import Link from 'next/link';
import InformationPage from '@/components/InformationPage';
import { getPageMetadata } from '@/lib/seo';
import { getPrivacyContact } from '@/lib/privacy-contact';

export const metadata = getPageMetadata({
  title: 'Privacy Notice', path: '/privacy',
  description: 'Understand the information Hyper handles, public content, cookies, messaging, service providers and your privacy choices at hyper.co.ke.',
});

export default function PrivacyPage() {
  const contact = getPrivacyContact();
  return <InformationPage title="Privacy notice" intro="This notice explains how information is handled by the current Hyper features and the choices available to you.">
    <p className="text-xs text-gray-500 dark:text-gray-400">Last updated: <time dateTime="2026-10-23">23 October 2026</time></p>
    <section><h2>Information you provide</h2><p>When you create an account or use Hyper, the service handles information such as your name, email address, password hash, profile details, posts, media, comments, reactions, group activity and messages. Optional profile fields contain the information you choose to add. Avoid sharing sensitive information in public posts or profile fields.</p></section>
    <section><h2>How information is used</h2><p>Information is used to create and authenticate accounts, show profiles and shared content, deliver messages and notifications, operate communities and calls, and support safety features such as blocking and reporting. Account information and user content are stored using the service’s database and configured media storage.</p></section>
    <section><h2>Public content and search engines</h2><p>Public posts, public profiles, public groups and other public pages may be viewed without an account and indexed by search engines. Other people may copy or share public information. Private content is excluded from search metadata and the sitemap; crawler settings are not a substitute for access controls. Search engines and copies outside Hyper may retain information after it changes here.</p></section>
    <section><h2>Cookies and browser storage</h2><p>Hyper uses an HTTP-only session cookie to keep you signed in. Sessions are configured to expire after seven days, and logging out clears the browser cookie. Theme preferences may be stored in your browser. Browser controls can clear cookies and local storage, but disabling essential cookies prevents normal sign-in.</p></section>
    <section><h2>Messages, calls and third-party services</h2><p>Messages and call-signaling data pass through the service’s infrastructure. Calling uses WebRTC and may involve configured STUN or TURN services; direct peer connections can reveal network addresses to participants. Do not assume messages or calls have an independently verified end-to-end encryption guarantee.</p><p>Hosting, database, media storage and Vercel Analytics support the app. Analytics may collect usage information. External images, fonts, embedded links and media can cause your browser to contact their providers, which may receive your IP address and request information. Sports information is requested from ESPN by the server. Providers handle information according to their own policies and infrastructure, which may be outside your country.</p></section>
    <section><h2>Your choices and requests</h2><p>Use <Link href="/settings">account settings</Link> to edit available profile information and privacy preferences, and use blocking and reporting tools where available. Depending on applicable law, you may be able to request access, correction, deletion or restriction of your personal information, or complain to the relevant data-protection authority. The operator may need to verify your identity before handling a request; do not send passwords or verification codes.</p></section>
    <section><h2>Retention and security</h2><p>Stored content, records, logs and backups may persist beyond a browser session. This notice does not promise a fixed deletion period or automatic account-deletion workflow; retention and deletion requests require confirmation from the site operator. Security measures reduce risk, but no online service can guarantee complete security.</p></section>
    <section><h2>Privacy contact</h2>{contact ? <p>For questions or personal-data requests, email <a href={`mailto:${contact}`} className="break-all">{contact}</a>.</p> : <p>The site operator has not yet published a dedicated privacy contact. This section will be updated when a contact address is provided. Do not post sensitive documents or account credentials publicly to request help.</p>}</section>
    <section><h2>Changes to this notice</h2><p>This notice may change as the service evolves. Check the date above when reviewing it. You can also read <Link href="/about">about Hyper</Link>.</p></section>
  </InformationPage>;
}
