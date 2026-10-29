import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    // A lesson release file is at most 2 MB (the database's limit); a server
    // action accepts 1 MB unless told otherwise.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default config;
