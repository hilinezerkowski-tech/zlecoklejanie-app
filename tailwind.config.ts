import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          lime: "#C8F04A",
          grafit: "#101317",
          "grafit-light": "#161A1F",
          kosc: "#F6F5F1",
          chrom: "#8A9099",
          border: "#232830",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
