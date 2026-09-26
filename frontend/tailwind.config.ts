import type { Config } from "tailwindcss";

// Theme tokens hold complete colors (OKLCH, see index.css). Opacity modifiers such as
// bg-primary/10 are applied with color-mix, the same way Tailwind v4 does it.
const token = (name: string) => `color-mix(in oklab, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Sora has no Vietnamese glyphs; the browser takes those letters from Manrope.
        display: ['"Sora Variable"', '"Manrope Variable"', "sans-serif"],
        sans: ['"Manrope Variable"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "monospace"],
      },
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
        },
        success: {
          DEFAULT: token("success"),
          foreground: token("success-foreground"),
        },
        warning: {
          DEFAULT: token("warning"),
          foreground: token("warning-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        coral: token("coral"),
        gold: token("gold"),
        "table-head": token("table-head"),
        sidebar: {
          DEFAULT: token("card"),
          foreground: token("foreground"),
          primary: token("primary"),
          "primary-foreground": token("primary-foreground"),
          accent: token("muted"),
          "accent-foreground": token("foreground"),
          border: token("border"),
          ring: token("ring"),
        },
      },
      borderRadius: {
        lg: "calc(var(--radius) + 2px)",
        md: "var(--radius)",
        sm: "calc(var(--radius) - 2px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        grow: {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        rise: "rise 0.42s cubic-bezier(0.32, 0.72, 0, 1) both",
        grow: "grow 0.65s cubic-bezier(0.32, 0.72, 0, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
