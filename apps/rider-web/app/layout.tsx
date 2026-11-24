import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'QuickDoc Rider',
  description: 'Print and attestation delivery operations',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
