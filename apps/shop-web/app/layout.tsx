import type { Metadata } from 'next';
import './styles.css';
import { SessionRefresh } from './session-refresh';

export const metadata: Metadata = {
  title: 'QuickDoc Shop Portal',
  description: 'Printing shop operations workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SessionRefresh access="shop-access-token" refresh="shop-refresh-token" signInPath="/" />{children}</body></html>;
}
