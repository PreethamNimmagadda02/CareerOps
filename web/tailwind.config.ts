import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind is kept for layout utilities only; every color, font, radius and
 * shadow below is a thin alias over an Astryx theme token, so utility classes
 * stay on-system and follow light/dark mode automatically (Astryx tokens are
 * `light-dark()` pairs). `color-mix` keeps `/opacity` modifiers working.
 */
const token = (name: string) =>
  `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  // Astryx drives dark mode through `data-theme` on <html>.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-family-body)", "system-ui", "sans-serif"],
        display: ["var(--font-family-heading)", "var(--font-family-body)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        border: token("--color-border"),
        input: token("--color-border-emphasized"),
        ring: token("--color-accent"),
        background: token("--color-background-body"),
        surface: token("--color-background-surface"),
        foreground: token("--color-text-primary"),
        primary: {
          DEFAULT: token("--color-accent"),
          foreground: token("--color-on-accent"),
        },
        secondary: {
          DEFAULT: token("--color-background-muted"),
          foreground: token("--color-text-primary"),
        },
        muted: {
          DEFAULT: token("--color-background-muted"),
          foreground: token("--color-text-secondary"),
        },
        accent: {
          DEFAULT: token("--color-background-muted"),
          foreground: token("--color-text-primary"),
        },
        destructive: {
          DEFAULT: token("--color-error"),
          foreground: token("--color-on-error"),
        },
        card: {
          DEFAULT: token("--color-background-card"),
          foreground: token("--color-text-primary"),
        },
        success: token("--color-text-success"),
        warning: token("--color-text-warning"),
        info: token("--color-text-info"),
      },
      borderColor: {
        DEFAULT: token("--color-border"),
      },
      borderRadius: {
        sm: "var(--radius-inner)",
        md: "var(--radius-element)",
        lg: "var(--radius-container)",
      },
      boxShadow: {
        sm: "var(--shadow-low)",
        md: "var(--shadow-med)",
        lg: "var(--shadow-high)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.25s ease-out both",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
