import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
  {
    // Sign-in and sign-out use a full reload so cached ticket data is discarded.
    rules: { "@next/next/no-location-assign-relative-destination": "off" },
  },
];

export default config;
