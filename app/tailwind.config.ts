import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary
        'primary': '#006565',
        'on-primary': '#ffffff',
        'primary-container': '#008080',
        'on-primary-container': '#e3fffe',
        'primary-fixed': '#93f2f2',
        'primary-fixed-dim': '#76d6d5',
        'on-primary-fixed': '#002020',
        'on-primary-fixed-variant': '#004f4f',
        'inverse-primary': '#76d6d5',

        // Secondary
        'secondary': '#006d37',
        'on-secondary': '#ffffff',
        'secondary-container': '#6bfe9c',
        'on-secondary-container': '#00743a',
        'secondary-fixed': '#6bfe9c',
        'secondary-fixed-dim': '#4ae183',
        'on-secondary-fixed': '#00210c',
        'on-secondary-fixed-variant': '#005228',

        // Tertiary
        'tertiary': '#804f00',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#a26500',
        'on-tertiary-container': '#fff8f4',
        'tertiary-fixed': '#ffddb9',
        'tertiary-fixed-dim': '#ffb961',
        'on-tertiary-fixed': '#2b1700',
        'on-tertiary-fixed-variant': '#663e00',

        // Error
        'error': '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        // Surface
        'surface': '#faf9f5',
        'on-surface': '#1a1c1a',
        'surface-variant': '#e2e3df',
        'on-surface-variant': '#3e4949',
        'surface-bright': '#faf9f5',
        'surface-dim': '#dadad6',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f4f4f0',
        'surface-container': '#eeeeea',
        'surface-container-high': '#e8e8e4',
        'surface-container-highest': '#e2e3df',
        'surface-tint': '#006a6a',
        'inverse-surface': '#2f312e',
        'inverse-on-surface': '#f1f1ed',

        // Outline
        'outline': '#6e7979',
        'outline-variant': '#bdc9c8',

        // Background
        'background': '#faf9f5',
        'on-background': '#1a1c1a',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
      fontFamily: {
        headline: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['Inter', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['3.5rem', { lineHeight: '1.1', fontWeight: '800' }],
        'display-md': ['2.75rem', { lineHeight: '1.15', fontWeight: '700' }],
        'display-sm': ['2.25rem', { lineHeight: '1.2', fontWeight: '700' }],
        'headline-lg': ['2rem', { lineHeight: '1.25', fontWeight: '700' }],
        'headline-md': ['1.75rem', { lineHeight: '1.3', fontWeight: '700' }],
        'headline-sm': ['1.5rem', { lineHeight: '1.35', fontWeight: '600' }],
        'title-lg': ['1.375rem', { lineHeight: '1.4', fontWeight: '600' }],
        'title-md': ['1rem', { lineHeight: '1.5', fontWeight: '600' }],
        'title-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['0.875rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],
        'label-lg': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        'label-md': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
        'label-sm': ['0.6875rem', { lineHeight: '1.4', fontWeight: '500' }],
      },
      boxShadow: {
        'nudge': '0 12px 32px -4px rgba(0, 101, 101, 0.06)',
        'active-glow': '0 0 15px rgba(0, 101, 101, 0.2)',
        'ghost-border': '0 0 0 1px rgba(189, 201, 200, 0.15)',
      },
      backgroundImage: {
        'cta-gradient': 'linear-gradient(135deg, #006565, #008080)',
        'hero-text-gradient': 'linear-gradient(135deg, #006565, #4ae183)',
      },
      keyframes: {
        float1: {
          '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-10px) rotate(-2deg)' },
        },
        float2: {
          '0%, 100%': { transform: 'translateY(0) rotate(3deg)' },
          '50%': { transform: 'translateY(-14px) rotate(3deg)' },
        },
        float3: {
          '0%, 100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-12px) rotate(-1deg)' },
        },
      },
      animation: {
        float1: 'float1 6s ease-in-out infinite',
        float2: 'float2 7s ease-in-out infinite',
        float3: 'float3 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
