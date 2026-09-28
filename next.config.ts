import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Multipart API uploads pass through vinext's server-action body reader.
    // Keep this above the import service's 10 MB file limit plus form overhead.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
