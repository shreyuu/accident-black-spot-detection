import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * Root layout.
 *
 * `robots: noindex` because this is an internal moderation tool. Even behind
 * authentication, a dashboard that turns up in search results invites attention
 * it has nothing to gain from.
 */
export const metadata: Metadata = {
  title: 'Accident Black Spot Detection — Moderation',
  description: 'Internal moderation and black spot management dashboard.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
