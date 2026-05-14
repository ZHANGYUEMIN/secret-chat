/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  /**
   * 在 `index.css` 的 `@layer components` 里用 `@apply` 定义的类，若未出现在任意模板字符串中，
   * Tailwind 会认为「未使用」而不打进产物，曾导致线上有 JS class、无 CSS 规则。
   */
  safelist: [
    'btn-seg',
    'btn-seg--on',
    'btn-seg--off',
    'btn-seg-sm',
    'btn-seg-md',
    'btn-cta',
    'btn-subtle',
    'btn-icon-plain',
    'btn-danger-ghost',
    'btn-ghost-sm',
    'btn-ghost-icon',
    'btn-primary-icon',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 基础灰阶（基于 zinc，更中性、更克制）
        ink: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        // 唯一强调色：翡翠绿
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'soft': '0 1px 2px 0 rgb(0 0 0 / 0.4), 0 1px 3px 0 rgb(0 0 0 / 0.3)',
        'glow': '0 0 0 1px rgb(16 185 129 / 0.3), 0 4px 24px -4px rgb(16 185 129 / 0.25)',
      },
    },
  },
  plugins: [],
}
