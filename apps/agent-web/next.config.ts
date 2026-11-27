import type { NextConfig } from 'next';

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://quickdoc-fwuf.onrender.com/api/v1'
    : 'http://localhost:3001/api/v1');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
};

export default nextConfig;
