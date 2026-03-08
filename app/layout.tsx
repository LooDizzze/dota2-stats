import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import QueryProvider from '@/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'Dota 2 Tournament Stats',
  description: 'Professional Dota 2 tournament statistics and analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
            <Navbar />
            <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
