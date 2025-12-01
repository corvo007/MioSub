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
            colors: {
                // 项目主色调（基于现有使用的颜色）
                primary: {
                    DEFAULT: '#6366f1', // indigo-500
                    dark: '#4f46e5',    // indigo-600
                    light: '#818cf8',   // indigo-400
                },
                accent: {
                    purple: '#9333ea',  // purple-600
                    blue: '#3b82f6',    // blue-500
                    emerald: '#10b981', // emerald-500
                },
            },
            animation: {
                'fade-in': 'fadeIn 0.2s ease-out',
                'spin': 'spin 1s linear infinite',
                'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
        },
    },
    plugins: [],
}
