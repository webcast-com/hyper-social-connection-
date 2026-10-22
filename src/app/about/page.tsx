import Link from 'next/link';
import InformationPage from '@/components/InformationPage';
import { getPageMetadata } from '@/lib/seo';

export const metadata = getPageMetadata({
  title: 'About Hyper', path: '/about',
  description: 'Learn about Hyper, the social platform at hyper.co.ke for connecting with people, sharing posts, joining communities and following sports.',
});

export default function AboutPage() {
  return <InformationPage title="About Hyper" intro="A place to connect with people, share what matters, and discover communities and conversations.">
    <section><h2>What is Hyper?</h2><p>Hyper is a social platform at hyper.co.ke. It brings profiles, posts, community groups, messaging and sports discussions together in one place.</p></section>
    <section><h2>Explore the platform</h2><ul>
      <li><Link href="/discover">Discover people</Link>, follow profiles and find conversations that interest you.</li>
      <li>Share posts, photos, videos and stories, and join discussions through comments and reactions.</li>
      <li><Link href="/groups">Explore communities</Link> built around shared interests, with group conversations, events and calling features.</li>
      <li><Link href="/sports">Follow sports</Link> with ESPN-reported fixtures, scores and available match details. Coverage varies by competition; unavailable information is labeled.</li>
    </ul></section>
    <section><h2>Browse freely, participate with an account</h2><p>You can browse public pages without signing in. Posting, messaging and account-specific features require an account. <Link href="/signup">Create an account</Link> or <Link href="/login">log in</Link> to participate.</p></section>
    <section><h2>Respect people and their privacy</h2><p>Share thoughtfully, respect other people’s boundaries and avoid posting personal information without permission. Account settings include profile visibility and communication preferences. Read the <Link href="/privacy">privacy notice</Link> to understand how information is handled.</p></section>
  </InformationPage>;
}
