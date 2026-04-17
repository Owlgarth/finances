/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand
        "primary":        "var(--color-primary)",
        "primary-hover":  "var(--color-primary-hover)",

        // Surfaces
        "background":     "var(--color-background)",
        "surface":        "var(--color-surface)",
        "surface-hover":  "var(--color-surface-hover)",
        "surface-muted":  "var(--color-surface-muted)",

        // Borders
        "border":         "var(--color-border)",
        "border-focus":   "var(--color-border-focus)",

        // Text
        "text":           "var(--color-text)",
        "text-muted":     "var(--color-text-muted)",

        // Semantic / Financial
        "positive":       "var(--color-positive)",
        "positive-bg":    "var(--color-positive-bg)",
        "negative":       "var(--color-negative)",
        "negative-bg":    "var(--color-negative-bg)",
        "warning":        "var(--color-warning)",
        "warning-bg":     "var(--color-warning-bg)",
      },
      fontFamily: {
        "sans":   ["Geist", "sans-serif"],
        "mono":   ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "sm":    "4px",
        "none":  "0px",
      },
      zIndex: {
        "dropdown":       "100",
        "sticky":         "200",
        "sidebar":        "300",
        "bottom-nav":     "300",
        "topbar":         "400",
        "modal-backdrop": "500",
        "modal":          "510",
        "toast":          "600",
        "tooltip":        "700",
      },
    },
  },
  plugins: [],
}
