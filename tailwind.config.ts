import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Roboto", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      colors: {
        // M3 surface tokens
        surface: "hsl(var(--md-surface) / <alpha-value>)",
        "surface-dim": "hsl(var(--md-surface-dim) / <alpha-value>)",
        "surface-low": "hsl(var(--md-surface-container-low) / <alpha-value>)",
        "surface-container": "hsl(var(--md-surface-container) / <alpha-value>)",
        "surface-high": "hsl(var(--md-surface-container-high) / <alpha-value>)",
        "surface-highest": "hsl(var(--md-surface-container-highest) / <alpha-value>)",
        "on-surface": "hsl(var(--md-on-surface) / <alpha-value>)",
        "on-surface-variant": "hsl(var(--md-on-surface-variant) / <alpha-value>)",
        primary: "hsl(var(--md-primary) / <alpha-value>)",
        "on-primary": "hsl(var(--md-on-primary) / <alpha-value>)",
        "primary-container": "hsl(var(--md-primary-container) / <alpha-value>)",
        "on-primary-container": "hsl(var(--md-on-primary-container) / <alpha-value>)",
        secondary: "hsl(var(--md-secondary) / <alpha-value>)",
        "secondary-container": "hsl(var(--md-secondary-container) / <alpha-value>)",
        "on-secondary-container": "hsl(var(--md-on-secondary-container) / <alpha-value>)",
        tertiary: "hsl(var(--md-tertiary) / <alpha-value>)",
        "tertiary-container": "hsl(var(--md-tertiary-container) / <alpha-value>)",
        error: "hsl(var(--md-error) / <alpha-value>)",
        "on-error": "hsl(var(--md-on-error) / <alpha-value>)",
        "error-container": "hsl(var(--md-error-container) / <alpha-value>)",
        "on-error-container": "hsl(var(--md-on-error-container) / <alpha-value>)",
        success: "hsl(var(--md-success) / <alpha-value>)",
        "success-container": "hsl(var(--md-success-container) / <alpha-value>)",
        "on-success-container": "hsl(var(--md-on-success-container) / <alpha-value>)",
        outline: "hsl(var(--md-outline) / <alpha-value>)",
        "outline-variant": "hsl(var(--md-outline-variant) / <alpha-value>)",
        scrim: "hsl(var(--md-scrim) / <alpha-value>)",

        // shims for any class names libraries expect
        background: "hsl(var(--md-surface) / <alpha-value>)",
        foreground: "hsl(var(--md-on-surface) / <alpha-value>)",
        border: "hsl(var(--md-outline-variant) / <alpha-value>)",
        muted: "hsl(var(--md-surface-container) / <alpha-value>)",
        "muted-foreground": "hsl(var(--md-on-surface-variant) / <alpha-value>)",
        destructive: "hsl(var(--md-error) / <alpha-value>)",
        "destructive-foreground": "hsl(var(--md-on-error) / <alpha-value>)",
        card: "hsl(var(--md-surface-container-low) / <alpha-value>)",
        "primary-foreground": "hsl(var(--md-on-primary) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
