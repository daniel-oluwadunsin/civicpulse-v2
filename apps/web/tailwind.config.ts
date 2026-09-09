import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        swiss: {
          ink: "#000000",
          paper: "#FFFFFF",
          field: "#F2F2F2",
          signal: "#FF3000",
        },
      },
      fontFamily: { sans: ["Inter", "Arial", "Helvetica", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
