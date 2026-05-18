/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background layers
        bg: {
          base: '#0A0A0F',
          surface: '#111118',
          elevated: '#1A1A26',
        },
        // Brand
        primary: {
          DEFAULT: '#7C3AED',
          hover: '#6D28D9',
          light: '#8B5CF6',
          glow: 'rgba(124, 58, 237, 0.15)',
        },
        secondary: '#06B6D4',
        // Status
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        // Text
        text: {
          primary: '#F1F5F9',
          secondary: '#94A3B8',
          muted: '#475569',
        },
        // Border
        border: {
          DEFAULT: '#2A2A3D',
          subtle: '#1E1E2E',
          strong: '#3A3A52',
        },
        // Priority
        p0: '#EF4444',
        p1: '#F59E0B',
        p2: '#06B6D4',
        // Kanban columns
        todo: '#475569',
        'in-progress': '#7C3AED',
        'in-review': '#F59E0B',
        done: '#10B981',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(124, 58, 237, 0.3)',
        'glow-sm': '0 0 10px rgba(124, 58, 237, 0.2)',
        card: '0 4px 20px rgba(0, 0, 0, 0.4)',
        elevated: '0 8px 40px rgba(0, 0, 0, 0.6)',
        inner: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand':
          'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
        'gradient-surface':
          'linear-gradient(180deg, #1A1A26 0%, #111118 100%)',
        'hero-glow':
          'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        shimmer: 'shimmer 2s infinite',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
