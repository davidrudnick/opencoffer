/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
