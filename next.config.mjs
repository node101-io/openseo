/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3008/:path*', // Indexer backend
      },
    ];
  },
};

export default nextConfig;
