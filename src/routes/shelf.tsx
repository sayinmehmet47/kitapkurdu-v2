import { env } from "cloudflare:workers";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useState } from "react";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { listMessages, messageInput, postMessage } from "#/lib/messages";

const getShelf = createServerFn({ method: "GET" }).handler(async () => {
	const db = createDb(env.DB);
	const session = await getAuth().api.getSession({
		headers: getRequestHeaders(),
	});
	const messages = await listMessages(db);
	return { messages, isSignedIn: Boolean(session) };
});

const submitMessage = createServerFn({ method: "POST" })
	.validator(messageInput)
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (!session) throw new Error("Sign in before posting.");
		await postMessage(createDb(env.DB), session.user.id, data);
		return { success: true };
	});

export const Route = createFileRoute("/shelf")({
	loader: async () => getShelf(),
	component: ShelfPage,
});

function ShelfPage() {
	const router = useRouter();
	const { messages, isSignedIn } = Route.useLoaderData();
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!text.trim()) return;
		setError(null);
		try {
			await submitMessage({ data: { text } });
			setText("");
			router.invalidate();
		} catch {
			setError("Mesaj gönderilemedi. Lütfen tekrar deneyin.");
		}
	};

	return (
		<main className="demo-page">
			<section className="mx-auto w-full max-w-2xl px-4 py-10">
				<p className="island-kicker mb-2">Topluluk</p>
				<h1 className="demo-title">Raf Alanı</h1>
				<p className="demo-muted mt-2">Okurların kısa notları ve mesajları.</p>

				<div className="demo-card mt-6 p-4">
					{isSignedIn ? (
						<form onSubmit={handleSubmit} className="space-y-3">
							<label htmlFor="message" className="block text-sm font-semibold">
								Bir mesaj bırak
							</label>
							<textarea
								id="message"
								value={text}
								onChange={(event) => setText(event.target.value)}
								rows={3}
								maxLength={500}
								className="demo-input w-full"
							/>
							{error ? <p className="text-sm text-red-600">{error}</p> : null}
							<button type="submit" className="demo-button">
								Gönder
							</button>
						</form>
					) : (
						<p className="demo-muted text-sm">
							Mesaj bırakmak için{" "}
							<Link to="/demo/better-auth" className="underline">
								giriş yapın
							</Link>
							.
						</p>
					)}
				</div>

				<ul className="mt-8 space-y-3">
					{messages.map((entry) => (
						<li key={entry.id} className="demo-card p-4">
							<p className="text-sm font-semibold">{entry.username}</p>
							<p className="demo-muted mt-1">{entry.text}</p>
						</li>
					))}
					{messages.length === 0 ? (
						<li className="demo-card p-4 text-center demo-muted">
							Henüz mesaj yok.
						</li>
					) : null}
				</ul>
			</section>
		</main>
	);
}
