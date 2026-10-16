import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Source_Serif_4, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/context/SessionContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Editorial serif for headlines, institutional sans for UI text
const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'GD Arena — AI Voice Group Discussion Practice',
  description:
    'Practice campus-placement group discussions with diverse AI personas and neutral moderation in real time.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Some security extensions (e.g. Bitdefender) stamp `bis_skin_checked` onto
// every <div> before React hydrates, which triggers hydration-mismatch errors.
// This runs during HTML parsing and strips the attribute as soon as it appears.
const STRIP_EXTENSION_ATTRS = `(function(){var A='bis_skin_checked';function s(r){var n=r.querySelectorAll?r.querySelectorAll('['+A+']'):[];for(var i=0;i<n.length;i++)n[i].removeAttribute(A);}try{new MutationObserver(function(m){for(var i=0;i<m.length;i++){var t=m[i].target;if(m[i].type==='attributes'&&t.removeAttribute)t.removeAttribute(A);}}).observe(document.documentElement,{attributes:true,attributeFilter:[A],subtree:true});document.addEventListener('DOMContentLoaded',function(){s(document);});}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${plexSans.variable} dark scroll-smooth`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: STRIP_EXTENSION_ATTRS }} />
      </head>
      <body
        className="min-h-screen bg-[#0c0c0e] text-zinc-100 flex flex-col antialiased selection:bg-zinc-800 selection:text-white"
        suppressHydrationWarning
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
