/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        status: {
          open: 'hsl(var(--status-open))',
          'open-fg': 'hsl(var(--status-open-fg))',
          'in-progress': 'hsl(var(--status-in-progress))',
          'in-progress-fg': 'hsl(var(--status-in-progress-fg))',
          resolved: 'hsl(var(--status-resolved))',
          'resolved-fg': 'hsl(var(--status-resolved-fg))',
          closed: 'hsl(var(--status-closed))',
          'closed-fg': 'hsl(var(--status-closed-fg))',
        },
        priority: {
          low: 'hsl(var(--priority-low))',
          'low-fg': 'hsl(var(--priority-low-fg))',
          medium: 'hsl(var(--priority-medium))',
          'medium-fg': 'hsl(var(--priority-medium-fg))',
          high: 'hsl(var(--priority-high))',
          'high-fg': 'hsl(var(--priority-high-fg))',
          urgent: 'hsl(var(--priority-urgent))',
          'urgent-fg': 'hsl(var(--priority-urgent-fg))',
        },
      },
      backgroundImage: {
        app: 'linear-gradient(135deg, #eef2ff, #f0fdfa)',
        brand: 'linear-gradient(135deg, #6366f1, #14b8a6)',
      },
      boxShadow: {
        soft: '0 4px 20px rgba(79, 70, 229, 0.08)',
        card: '0 10px 40px rgba(79, 70, 229, 0.12)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
