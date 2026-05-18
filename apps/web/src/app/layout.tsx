import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'DevCollab — Real-Time Collaboration for Dev Teams',
    template: '%s | DevCollab',
  },
  description:
    'The all-in-one platform for student developer teams. Manage projects, write docs, review code, and collaborate in real time.',
  keywords: ['developer collaboration', 'project management', 'kanban', 'code review', 'team workspace'],
  authors: [{ name: 'DevCollab Team' }],
  openGraph: {
    title: 'DevCollab',
    description: 'Real-Time Project Collaboration Platform for Developers',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="bg-bg-base text-text-primary font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
