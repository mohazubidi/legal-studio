import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Middleware buffers request bodies; the default (10 MB) would truncate
    // document uploads. Upload limit is 20 MB plus multipart overhead.
    middlewareClientMaxBodySize: "21mb",
  },
};

export default nextConfig;
