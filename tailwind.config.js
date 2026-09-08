/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0e0e10",
        panel: "#141416",
        raised: "#1c1c1f",
        line: "#2a2a2e",
        fg: "#ececec",
        mute: "#8c8c93",
        faint: "#5c5c64",
        accent: "#4c8dff",
      },
      fontFamily: {
        sans: ['Inter', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        ui: ["13px", "18px"],
      },
    },
  },
  plugins: [],
};
