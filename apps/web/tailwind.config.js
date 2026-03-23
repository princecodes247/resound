/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cosmic: {
          bg: "#030305",
          surface: "#0a0a0f",
          card: "#111118",
          border: "#1a1a25",
          glow: "#7c3aed",
        },
        aurora: {
          cyan: "#06b6d4",
          purple: "#8b5cf6",
          pink: "#ec4899",
          blue: "#3b82f6",
        },
        stellar: {
          white: "#fafafa",
          silver: "#a1a1aa",
          dim: "#52525b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "spin-slow": "spin 12s linear infinite",
        "breathe": "breathe 8s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        glow: {
          "0%": { opacity: "0.4", transform: "scale(1)" },
          "100%": { opacity: "0.8", transform: "scale(1.1)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "aurora-gradient": "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%)",
      },
    },
  },
  plugins: [],
};
