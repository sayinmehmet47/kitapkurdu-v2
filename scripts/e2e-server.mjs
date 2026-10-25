import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

// Fail before building if another process owns the test port; never reuse a real app.
const probe = createServer();
probe.listen(4173, "127.0.0.1");
await once(probe, "listening");
await new Promise((resolve, reject) =>
	probe.close((error) => (error ? reject(error) : resolve())),
);

await mkdir(join(root, ".wrangler"), { recursive: true });
const statePath = await mkdtemp(join(root, ".wrangler", "e2e-"));
const configPath = join(statePath, "wrangler.json");
const config = JSON.parse(
	await readFile(join(root, "wrangler.e2e.json"), "utf8"),
);
config.main = fileURLToPath(
	import.meta.resolve("@tanstack/react-start/server-entry"),
);
config.d1_databases[0].migrations_dir = join(root, "drizzle");
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
await writeFile(
	join(statePath, ".dev.vars"),
	`BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\n`,
	{ mode: 0o600 },
);
const env = {
	...process.env,
	APP_E2E: "1",
	E2E_STATE_DIR: statePath,
	E2E_CONFIG_PATH: configPath,
	CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
	WRANGLER_SEND_METRICS: "false",
	CI: process.env.CI || "true",
};
// Do not inherit credentials, remote environment selection, or application secrets.
for (const key of Object.keys(env)) {
	if (
		key.startsWith("CLOUDFLARE_") &&
		key !== "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV"
	)
		delete env[key];
	if (key.startsWith("CF_")) delete env[key];
}
delete env.DATABASE_URL;
delete env.BETTER_AUTH_SECRET;
delete env.BETTER_AUTH_URL;
delete env.CLOUDFLARE_ENV;

let child;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		stopping = true;
		child?.kill("SIGTERM");
	});
}

async function run(modulePath, args) {
	if (stopping) return;
	child = spawn(
		process.execPath,
		[join(root, "node_modules", modulePath), ...args],
		{
			cwd: root,
			env,
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
	const [code] = await once(child, "exit");
	child = undefined;
	if (!stopping && code !== 0)
		throw new Error(`${modulePath} failed with exit code ${code}`);
}

try {
	await run("wrangler/bin/wrangler.js", [
		"d1",
		"migrations",
		"apply",
		"DB",
		"--local",
		"--config",
		configPath,
		"--persist-to",
		statePath,
	]);
	await run("vite/bin/vite.js", ["build"]);
	await run("vite/bin/vite.js", [
		"preview",
		"--host",
		"127.0.0.1",
		"--port",
		"4173",
		"--strictPort",
	]);
} finally {
	// This uniquely generated directory belongs to this run, not normal local D1.
	await rm(statePath, { recursive: true, force: true });
}
