import { env } from "cloudflare:workers";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useState } from "react";
import { z } from "zod";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { getBookById } from "#/lib/books";
import {
	getMyRating,
	getRatingSummary,
	listRatings,
	ratingInput,
	upsertRating,
} from "#/lib/ratings";

const getBookDetail = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.string().min(1).max(64) }))
	.handler(async ({ data }) => {
		const db = createDb(env.DB);
		const item = await getBookById(db, data.id);
		if (!item) return null;

		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		const myRating = session
			? await getMyRating(db, item.id, session.user.id)
			: null;

		const [summary, ratings] = await Promise.all([
			getRatingSummary(db, item.id),
			listRatings(db, item.id),
		]);

		return {
			item,
			summary,
			ratings,
			myRating,
			isSignedIn: Boolean(session),
		};
	});

const submitRating = createServerFn({ method: "POST" })
	.validator(ratingInput)
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (!session) throw new Error("Sign in before rating.");
		await upsertRating(createDb(env.DB), session.user.id, data);
		return { success: true };
	});

export const Route = createFileRoute("/books/$id")({
	loader: async ({ params }) => getBookDetail({ data: { id: params.id } }),
	component: BookDetailPage,
});

function formatBytes(size: number | null) {
	if (size === null || size === undefined) return null;
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function Stars({ value }: { value: number }) {
	return (
		<span role="img" aria-label={`${value} yıldız`} className="text-amber-500">
			{"★".repeat(Math.round(value))}
			<span className="text-[var(--sea-ink-soft)]">
				{"★".repeat(5 - Math.round(value))}
			</span>
		</span>
	);
}

function RatingForm({
	bookId,
	initial,
}: {
	bookId: string;
	initial: { rating: number; review: string | null } | null;
}) {
	const router = useRouter();
	const [rating, setRating] = useState<string>(
		initial ? String(initial.rating) : "",
	);
	const [review, setReview] = useState(initial?.review ?? "");
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = Number(rating);
		if (!Number.isInteger(value) || value < 1 || value > 5) {
			setError("Lütfen 1 ile 5 arasında bir puan seçin.");
			return;
		}
		setError(null);
		try {
			await submitRating({ data: { bookId, rating: value, review } });
			router.invalidate();
		} catch {
			setError("Değerlendirme gönderilemedi. Lütfen tekrar deneyin.");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="mt-6 space-y-3">
			<div>
				<label htmlFor="rating" className="mb-1 block text-sm font-semibold">
					Puanın
				</label>
				<select
					id="rating"
					value={rating}
					onChange={(event) => setRating(event.target.value)}
					className="demo-input"
				>
					<option value="">Puan seç</option>
					{[1, 2, 3, 4, 5].map((n) => (
						<option key={n} value={n}>
							{n} yıldız
						</option>
					))}
				</select>
			</div>
			<div>
				<label htmlFor="review" className="mb-1 block text-sm font-semibold">
					Yorum (isteğe bağlı)
				</label>
				<textarea
					id="review"
					value={review}
					onChange={(event) => setReview(event.target.value)}
					rows={3}
					className="demo-input w-full"
				/>
			</div>
			{error ? <p className="text-sm text-red-600">{error}</p> : null}
			<button type="submit" className="demo-button">
				{initial ? "Güncelle" : "Gönder"}
			</button>
		</form>
	);
}

function BookDetailPage() {
	const data = Route.useLoaderData();
	const { id } = Route.useParams();

	if (!data) {
		return (
			<main className="demo-page demo-center">
				<section className="demo-panel w-full max-w-2xl text-center">
					<h1 className="demo-title">Kitap bulunamadı</h1>
					<p className="demo-muted mt-2">
						“{id}” kimliğine sahip bir kitap yok veya kaldırılmış.
					</p>
					<Link to="/books" className="demo-button mt-6 inline-block">
						← Kitaplara dön
					</Link>
				</section>
			</main>
		);
	}

	const { item, summary, ratings, myRating, isSignedIn } = data;
	const language = item.language === "english" ? "English" : "Türkçe";
	const average = Number(summary?.average ?? 0);
	const count = summary?.count ?? 0;

	return (
		<main className="demo-page">
			<section className="mx-auto w-full max-w-4xl px-4 py-10">
				<Link to="/books" className="demo-muted text-sm hover:underline">
					← Kitaplara dön
				</Link>

				<div className="mt-6 flex flex-col gap-8 sm:flex-row">
					<div className="w-full max-w-xs shrink-0">
						{item.coverThumbnail ? (
							<img
								src={item.coverThumbnail}
								alt={`${item.name} kapağı`}
								className="aspect-[2/3] w-full rounded-md object-cover"
							/>
						) : (
							<div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-muted text-6xl">
								📖
							</div>
						)}
					</div>

					<div className="min-w-0 flex-1">
						<p className="island-kicker mb-2">Kitap</p>
						<h1 className="demo-title">{item.name}</h1>
						{item.author ? (
							<p className="demo-muted mt-2 text-lg">{item.author}</p>
						) : null}

						<dl className="mt-6 space-y-2 text-sm">
							{item.publisher ? (
								<div className="flex gap-2">
									<dt className="w-28 shrink-0 font-semibold">Yayınevi</dt>
									<dd>{item.publisher}</dd>
								</div>
							) : null}
							{item.isbn ? (
								<div className="flex gap-2">
									<dt className="w-28 shrink-0 font-semibold">ISBN</dt>
									<dd>{item.isbn}</dd>
								</div>
							) : null}
							<div className="flex gap-2">
								<dt className="w-28 shrink-0 font-semibold">Dil</dt>
								<dd>{language}</dd>
							</div>
							{item.size !== null && item.size !== undefined ? (
								<div className="flex gap-2">
									<dt className="w-28 shrink-0 font-semibold">Boyut</dt>
									<dd>{formatBytes(item.size)}</dd>
								</div>
							) : null}
						</dl>

						{(item.category ?? []).length > 0 ? (
							<ul className="mt-4 flex flex-wrap gap-1">
								{(item.category ?? []).map((category) => (
									<li
										key={category}
										className="rounded-full bg-muted px-2 py-0.5 text-xs"
									>
										{category}
									</li>
								))}
							</ul>
						) : null}

						{item.description ? (
							<p className="demo-muted mt-6 leading-relaxed">
								{item.description}
							</p>
						) : null}

						{item.fileUrl ? (
							<a
								href={item.fileUrl}
								target="_blank"
								rel="noreferrer"
								className="demo-button mt-6 inline-block"
							>
								Kitabı aç
							</a>
						) : (
							<p className="demo-muted mt-6 text-sm">
								Bu kitap için dosya henüz eklenmemiş.
							</p>
						)}
					</div>
				</div>

				<section className="mt-12 border-t border-[var(--chip-line)] pt-8">
					<h2 className="demo-section-title mb-2">Değerlendirmeler</h2>
					<p className="demo-muted mb-6 text-sm">
						<Stars value={average} /> {average.toFixed(1)} · {count} yorum
					</p>

					{ratings.length > 0 ? (
						<ul className="space-y-4">
							{ratings.map((entry) => (
								<li key={entry.id} className="demo-card p-4">
									<div className="flex items-center gap-2">
										<span className="font-semibold">{entry.username}</span>
										<Stars value={entry.rating} />
									</div>
									{entry.review ? (
										<p className="demo-muted mt-2 text-sm">{entry.review}</p>
									) : null}
								</li>
							))}
						</ul>
					) : (
						<p className="demo-muted text-sm">Henüz yorum yok.</p>
					)}

					<div className="demo-card mt-6 p-4">
						{isSignedIn ? (
							<RatingForm bookId={item.id} initial={myRating ?? null} />
						) : (
							<p className="demo-muted text-sm">
								Değerlendirmek için{" "}
								<Link to="/demo/better-auth" className="underline">
									giriş yapın
								</Link>
								.
							</p>
						)}
					</div>
				</section>
			</section>
		</main>
	);
}
