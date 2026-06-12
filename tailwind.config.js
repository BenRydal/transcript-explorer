/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	daisyui: {
		themes: [
			{
				light: {
					primary: '#40d173',
					secondary: '#6136c4',
					accent: '#ef9475',
					neutral: '#1F2C33',
					'base-100': '#FBFCFD',
					info: '#9AD4E4',
					success: '#29DB7F',
					warning: '#F9D42F',
					error: '#EB245F',
					'color-scheme': 'light'
				}
			},
			{
				dark: {
					/* Same brand hues, rebalanced for a dark ground */
					primary: '#4fd87f',
					secondary: '#a78bfa',
					accent: '#f4a581',
					neutral: '#0b141a',
					'base-100': '#0f1419',
					'base-200': '#131820',
					'base-300': '#1a1f26',
					'base-content': '#e5e7eb',
					info: '#9AD4E4',
					success: '#29DB7F',
					warning: '#F9D42F',
					error: '#F87171',
					'color-scheme': 'dark'
				}
			}
		],
		darkTheme: 'dark',
		logs: false
	},
	plugins: [require('daisyui')]
};
