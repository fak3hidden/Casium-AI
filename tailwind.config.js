/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#050608",
          900: "#08090d",
          850: "#0c0e14",
          800: "#11141c",
          700: "#171b26",
          600: "#1e2433",
          500: "#2a3144",
        },
        line: "#232a3b",
        casium: {
          DEFAULT: "#3ee8c5",
          dim: "#1aa88c",
          glow: "rgba(62, 232, 197, 0.18)",
        },
        electric: "#6ea8ff",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(62, 232, 197, 0.12)",
        panel: "0 20px 60px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        noise:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
