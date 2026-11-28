import type { Metadata, Viewport } from 'next';
import './styles.css';
import { SessionRefresh } from './session-refresh';

export const metadata: Metadata = {
  title: 'QuickDoc Rider',
  description: 'Print and attestation delivery operations',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SessionRefresh access="rider-access-token" refresh="rider-refresh-token" signInPath="/" />{children}</body></html>;
}
