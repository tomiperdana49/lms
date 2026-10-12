/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      // The nearest training on the /upcoming-training TV board glows and its badge blinks.
      keyframes: {
        'nearest-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(251, 191, 36, 0)', borderColor: 'rgba(251, 191, 36, 0.45)' },
          '50%': { boxShadow: '0 0 36px 6px rgba(251, 191, 36, 0.45)', borderColor: 'rgba(251, 191, 36, 1)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'nearest-glow': 'nearest-glow 1.8s ease-in-out infinite',
        blink: 'blink 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
