import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Rationale for each header:
 *   - X-Frame-Options: DENY — prevents clickjacking; no legitimate iframing of you2ube.
 *   - X-Content-Type-Options: nosniff — prevents MIME-sniffing attacks.
 *   - Referrer-Policy: strict-origin-when-cross-origin — limits referrer leakage to
 *     same-origin full URL and cross-origin origin-only.
 *   - Permissions-Policy: disables unused browser features (camera, mic, geolocation,
 *     payment, usb) to reduce attack surface.
 *   - Strict-Transport-Security: forces HTTPS for 1 year in production only (would
 *     break local dev over http).
 *   - Cross-Origin-Opener-Policy: same-origin — isolates the browsing context.
 *   - Cross-Origin-Resource-Policy: same-origin — prevents hotlinking of assets.
 *
 * Content-Security-Policy is intentionally permissive for 'self' + 'unsafe-inline'
 * (Tailwind JIT injects inline styles, Next.js injects inline scripts for HMR in
 * dev). Discord CDN is allow-listed for avatar images. WebSockets are allowed to
 * localhost for Discord RPC. In a hardened production deployment, replace
 * 'unsafe-inline' with a nonce-based policy.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://cdn.discordapp.com https://cdn.discord.com",
      "connect-src 'self' https://discord.com https://cdn.discordapp.com ws://127.0.0.1:* http://127.0.0.1:*",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://discord.com",
    ].join("; "),
  },
];

// Only add HSTS in production — breaks local http development.
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  // Apply security headers to every route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  // Harden the static image loader — disallow remote images unless explicitly
  // allowed. Discord avatars go through the remotePatterns list.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "cdn.discord.com" },
    ],
  },

  // Ensure experimental features are off in production for stability.
  experimental: {},

  // Power up the /api/health route to respond without any security middleware
  // overhead (it's already force-dynamic in the route file).
};

export default nextConfig;
