import { env } from "cloudflare:workers";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { formatDate } from "#/lib/dates";
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
		<main className="page-wrap pt-10 sm:pt-14">
			<div className="max-w-2xl">
				<h1 className="text-4xl leading-none font-semibold sm:text-5xl">
					Raf Alanı
				</h1>
				<p className="mt-4 font-serif text-xl text-muted-foreground">
					Okurların birbirine bıraktığı kısa notlar: bir öneri, bir alıntı, bir
					soru.
				</p>

				<div className="mt-10 border-t border-border pt-8">
					{isSignedIn ? (
						<form onSubmit={handleSubmit} className="grid gap-3">
							<Label htmlFor="message">Bir mesaj bırak</Label>
							<Textarea
								id="message"
								value={text}
								onChange={(event) => setText(event.target.value)}
								rows={3}
								maxLength={500}
								className="bg-card"
							/>
							{error ? (
								<p role="alert" className="text-sm text-destructive">
									{error}
								</p>
							) : null}
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs text-muted-foreground">
									{text.length} / 500
								</span>
								<Button type="submit" disabled={!text.trim()}>
									Gönder
								</Button>
							</div>
						</form>
					) : (
						<p className="text-muted-foreground">
							Mesaj bırakmak için{" "}
							<Link to="/sign-in" search={{ redirect: "/shelf" }}>
								giriş yapın
							</Link>
							.
						</p>
					)}
				</div>

				{messages.length > 0 ? (
					<ul className="mt-10 divide-y divide-border border-y border-border">
						{messages.map((entry) => (
							<li key={entry.id} className="py-6">
								<p className="font-serif text-xl leading-relaxed whitespace-pre-line">
									{entry.text}
								</p>
								<p className="mt-2 text-sm text-muted-foreground">
									<span className="font-medium text-foreground">
										{entry.username}
									</span>
									{" · "}
									<time dateTime={new Date(entry.createdAt).toISOString()}>
										{formatDate(entry.createdAt)}
									</time>
								</p>
							</li>
						))}
					</ul>
				) : (
					<p className="mt-10 font-serif text-lg text-muted-foreground italic">
						Henüz mesaj yok. İlk notu sen bırak.
					</p>
				)}
			</div>
		</main>
	);
}
