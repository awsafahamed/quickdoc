import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'QuickDoc Attestation',
  description: 'Attestation processing and custody workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
