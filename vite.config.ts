import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isE2E = process.env.APP_E2E === "1";
function getE2EOptions() {
	if (!isE2E) return {};
	const configPath = process.env.E2E_CONFIG_PATH;
	const path = process.env.E2E_STATE_DIR;
	if (!configPath || !path) {
		throw new Error(
			"Start the isolated browser-test app with npm run dev:e2e.",
		);
	}
	return {
		configPath,
		persistState: { path },
		inspectorPort: false as const,
		remoteBindings: false,
	};
}

const config = defineConfig({
	envDir: isE2E ? false : undefined,
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		cloudflare({
			viteEnvironment: { name: "ssr" },
			...getE2EOptions(),
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
