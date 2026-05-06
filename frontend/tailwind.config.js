/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        chatEndBackdrop: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        chatEndCard: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'chat-end-backdrop': 'chatEndBackdrop 0.28s ease-out forwards',
        'chat-end-card': 'chatEndCard 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      boxShadow: {
        'chat-end': '0 0 0 1px rgba(15, 23, 42, 0.06), 0 4px 6px -2px rgba(15, 23, 42, 0.05), 0 24px 48px -12px rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [],
};
