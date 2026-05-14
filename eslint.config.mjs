import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "lib/design/tokens.css",
      "lib/design/tokens.ts",
      "lib/design/tokens.d.ts",
      "supabase/functions/**",
    ],
  },
];

export default config;
