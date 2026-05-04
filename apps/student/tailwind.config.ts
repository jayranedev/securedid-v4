import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/shared/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { 50:"#f0fdfa",100:"#ccfbf1",400:"#2dd4bf",500:"#14b8a6",600:"#0d9488",700:"#0f766e" },
      },
      fontFamily: { sans:["Inter","system-ui","sans-serif"], mono:["ui-monospace","SFMono-Regular","monospace"] },
    },
  },
  plugins: [],
};
export default config;
