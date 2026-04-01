/** @type {import('next').NextConfig} */
const nextConfig = {  
  output: 'export',
   images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/aztec-crs/:path*',
        destination: 'https://crs.aztec.network/:path*',
      },
    ]
  },

  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;