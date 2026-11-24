import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'QuickDoc',
  description: 'Simple, trusted document services.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
