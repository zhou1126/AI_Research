import type { NextConfig } from "next";
import { codespaceOrigin } from "./scripts/provider-env.mjs";

const origin = codespaceOrigin();
const nextConfig: NextConfig = {
  // Vinext checks development request origins independently of Vite's host check.
  allowedDevOrigins: origin ? [new URL(origin).hostname] : [],
};

export default nextConfig;
