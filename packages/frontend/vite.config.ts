import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
				clientsClaim: true,
				skipWaiting: true,
				navigateFallback: "/index.html",
			},
			manifest: {
				name: "BonPlan - Trouveur de bonnes affaires",
				short_name: "BonPlan",
				description: "Trouvez les meilleures affaires sur LeBonCoin",
				theme_color: "#1a1a2e",
				background_color: "#1a1a2e",
				display: "standalone",
				start_url: "/",
				icons: [
					{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
					{ src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
					{
						src: "/pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
			"@bonplan/shared/types": resolve(__dirname, "src/types/shared.ts"),
			"@bonplan/shared/ai-models": resolve(__dirname, "src/types/ai-models.ts"),
		},
	},
	server: {
		proxy: {
			"/api": "http://localhost:3000",
			"/ws": { target: "http://localhost:3000", ws: true },
		},
	},
});
