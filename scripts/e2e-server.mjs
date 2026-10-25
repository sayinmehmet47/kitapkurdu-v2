import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

// Fail before building if another process owns a test port; never reuse a real app.
for (const port of [4173, 4175]) {
	const probe = createServer();
	probe.listen(port, "127.0.0.1");
	await once(probe, "listening");
	await new Promise((resolve, reject) =>
		probe.close((error) => (error ? reject(error) : resolve())),
	);
}

// Local stand-ins for Google Books and Open Library (GOOGLE_BOOKS_API_URL and
// OPEN_LIBRARY_API_URL in wrangler.e2e.json), so lookups never leave this machine.
const stubVolume = {
	title: "Kürk Mantolu Madonna",
	authors: ["Sabahattin Ali"],
	publisher: "Yapı Kredi Yayınları",
	description: "Raif Efendi'nin Berlin'de tanıdığı Maria Puder'e duyduğu aşk.",
	categories: ["Fiction"],
	industryIdentifiers: [{ type: "ISBN_13", identifier: "9789750719387" }],
	imageLinks: {
		smallThumbnail: "http://books.google.com/books/content?id=e2e&zoom=5",
		thumbnail: "http://books.google.com/books/content?id=e2e&zoom=1",
	},
};
const booksApi = createHttpServer((request, response) => {
	const url = new URL(request.url ?? "/", "http://127.0.0.1:4175");
	const q = url.searchParams.get("q");
	if (url.pathname === "/search.json") {
		// Open Library: down for "Kota Doldu"; only knows the book Google fails on.
		if (url.searchParams.get("title") === "Kota Doldu") {
			response.writeHead(503, { "content-type": "text/plain" });
			response.end("unavailable");
			return;
		}
		const known = url.searchParams.get("title") === "Yedekten Gelen Kitap";
		response.writeHead(200, { "content-type": "application/json" });
		response.end(
			JSON.stringify({
				docs: known
					? [
							{
								title: "Yedekten Gelen Kitap",
								author_name: ["Open Library Yazarı"],
								subject: ["Roman"],
								cover_i: 1,
							},
						]
					: [],
			}),
		);
		return;
	}
	// Google answers 429 when its quota is spent and 503 "backendFailed" when
	// its backend is down; let tests see both. "Kota Doldu" fails everywhere.
	if (q === "Kota Doldu" || q === "Yedekten Gelen Kitap") {
		const status = q === "Kota Doldu" ? 429 : 503;
		response.writeHead(status, { "content-type": "application/json" });
		response.end(JSON.stringify({ error: { code: status } }));
		return;
	}
	const match =
		url.pathname === "/books/v1/volumes" &&
		(q === "isbn:9789750719387" || q === stubVolume.title);
	response.writeHead(200, { "content-type": "application/json" });
	response.end(
		JSON.stringify(
			match
				? { totalItems: 1, items: [{ volumeInfo: stubVolume }] }
				: { totalItems: 0 },
		),
	);
});
booksApi.listen(4175, "127.0.0.1");
await once(booksApi, "listening");

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
// Only the seed step needs this synthetic credential, not Vite or the Worker.
const adminPassword =
	env.E2E_ADMIN_PASSWORD ?? randomBytes(24).toString("base64url");
delete env.E2E_ADMIN_PASSWORD;

// Deterministic test-only catalog so the browse UI has something to render.
// Covers are omitted on purpose to avoid external image requests in tests.
// Seeds are dated in 2100 so they stay first in "recently added" lists no
// matter how many books other tests upload in parallel.
const seededAt = Date.UTC(2100, 0, 1);
const seedBooks = `INSERT INTO book (id, name, author, category, language, description, created_at, updated_at) VALUES
('seed-sefiller', 'Sefiller', 'Victor Hugo', '["Roman","Klasik"]', 'turkish', 'Klasik bir roman.', ${seededAt}, ${seededAt}),
('seed-suc-ve-ceza', 'Suç ve Ceza', 'Fyodor Dostoyevski', '["Roman"]', 'turkish', 'Psikolojik bir roman.', ${seededAt}, ${seededAt}),
('seed-1984', '1984', 'George Orwell', '["Bilim Kurgu"]', 'english', 'Distopik bir roman.', ${seededAt}, ${seededAt}),
('seed-tutunamayanlar', 'Tutunamayanlar', 'Oğuz Atay', '["Roman"]', 'turkish', 'Uzun, tek kelimelik bir başlık.', ${seededAt}, ${seededAt});`;

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
	const seedPath = join(statePath, "admin-seed.sql");
	const passwordHash = await hashPassword(adminPassword);
	await writeFile(
		seedPath,
		`
INSERT INTO user (id, name, email, role) VALUES
('e2e-admin', 'Browser Test Admin', 'admin@example.test', 'admin');
INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES
('e2e-admin-account', 'e2e-admin', 'credential', 'e2e-admin', '${passwordHash}');
`,
		{ mode: 0o600 },
	);
	await run("wrangler/bin/wrangler.js", [
		"d1",
		"execute",
		"DB",
		"--local",
		"--config",
		configPath,
		"--persist-to",
		statePath,
		"--file",
		seedPath,
	]);
	await run("wrangler/bin/wrangler.js", [
		"d1",
		"execute",
		"DB",
		"--local",
		"--config",
		configPath,
		"--persist-to",
		statePath,
		"--command",
		seedBooks,
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
	booksApi.close();
	// This uniquely generated directory belongs to this run, not normal local D1.
	await rm(statePath, { recursive: true, force: true });
}
