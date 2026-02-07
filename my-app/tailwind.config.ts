import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hirexa: {
          navy: "#060814",
          blue: "#1050F0",
          cyan: "#20A0F0",
          sky: "#20C8FF",
          orange: "#FF7A00",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,.08), 0 20px 80px rgba(0,0,0,.55)",
      },
    },
  },
  plugins: [],
} satisfies Config;
