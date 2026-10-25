import { env } from "cloudflare:workers";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useState } from "react";
import { z } from "zod";
import { BookCover } from "#/components/books/BookCover";
import { CategoryList } from "#/components/books/CategoryList";
import { Button, buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { storedBookFormat } from "#/lib/book-file-format";
import {
	bookUpdateInput,
	deleteBookById,
	getBookById,
	markBookDuplicate,
	updateBook,
} from "#/lib/books";
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
			isAdmin: session?.user?.role === "admin",
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

const adminEditInput = z.object({
	id: z.string().min(1).max(64),
	...bookUpdateInput.shape,
});

const submitBookEdit = createServerFn({ method: "POST" })
	.validator(adminEditInput)
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (session?.user?.role !== "admin") {
			throw new Error("Yönetici izni gerekiyor.");
		}
		const { id, ...fields } = data;
		await updateBook(createDb(env.DB), id, fields);
		return { success: true };
	});

const submitDeleteBook = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().min(1).max(64) }))
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (session?.user?.role !== "admin") {
			throw new Error("Yönetici izni gerekiyor.");
		}
		await deleteBookById(createDb(env.DB), data.id);
		return { success: true };
	});

const submitMarkDuplicate = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().min(1).max(64),
			canonicalId: z.string().min(1).max(64),
		}),
	)
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (session?.user?.role !== "admin") {
			throw new Error("Yönetici izni gerekiyor.");
		}
		await markBookDuplicate(createDb(env.DB), data.id, data.canonicalId);
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
	const filled = Math.round(value);
	return (
		<span
			role="img"
			aria-label={`5 üzerinden ${value} yıldız`}
			className="tracking-[0.08em] text-primary"
		>
			{"★".repeat(filled)}
			<span className="text-input">{"★".repeat(5 - filled)}</span>
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
		<form onSubmit={handleSubmit} className="grid gap-4">
			<h3 className="text-xl font-semibold">
				{initial ? "Değerlendirmeni güncelle" : "Bu kitabı değerlendir"}
			</h3>
			<div className="grid gap-2">
				<Label htmlFor="rating">Puanın</Label>
				<select
					id="rating"
					value={rating}
					onChange={(event) => setRating(event.target.value)}
					className="h-10 w-full max-w-48 rounded-md border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
				>
					<option value="">Puan seç</option>
					{[1, 2, 3, 4, 5].map((n) => (
						<option key={n} value={n}>
							{n} yıldız
						</option>
					))}
				</select>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="review">Yorum (isteğe bağlı)</Label>
				<Textarea
					id="review"
					value={review}
					onChange={(event) => setReview(event.target.value)}
					rows={4}
					className="bg-card"
				/>
			</div>
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : null}
			<Button type="submit" className="justify-self-start">
				{initial ? "Güncelle" : "Gönder"}
			</Button>
		</form>
	);
}

function AdminPanel({
	item,
}: {
	item: {
		id: string;
		name: string;
		author: string | null;
		publisher: string | null;
		isbn: string | null;
		description: string | null;
		category: string[] | null;
		language: "turkish" | "english";
	};
}) {
	const router = useRouter();
	const [name, setName] = useState(item.name);
	const [author, setAuthor] = useState(item.author ?? "");
	const [publisher, setPublisher] = useState(item.publisher ?? "");
	const [isbn, setIsbn] = useState(item.isbn ?? "");
	const [description, setDescription] = useState(item.description ?? "");
	const [category, setCategory] = useState((item.category ?? []).join(", "));
	const [language, setLanguage] = useState(item.language);
	const [canonicalId, setCanonicalId] = useState("");
	const [error, setError] = useState<string | null>(null);

	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		try {
			await submitBookEdit({
				data: {
					id: item.id,
					name,
					author,
					publisher,
					isbn,
					description,
					category,
					language,
				},
			});
			router.invalidate();
		} catch {
			setError("Kaydedilemedi. Lütfen tekrar deneyin.");
		}
	};

	const markDup = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		try {
			await submitMarkDuplicate({ data: { id: item.id, canonicalId } });
			setCanonicalId("");
			router.invalidate();
		} catch {
			setError("Kopya olarak işaretlenemedi.");
		}
	};

	const remove = async () => {
		if (!window.confirm("Bu kitabı silmek istediğinize emin misiniz?")) return;
		setError(null);
		try {
			await submitDeleteBook({ data: { id: item.id } });
			router.navigate({ to: "/books" });
		} catch {
			setError("Silinemedi.");
		}
	};

	return (
		<section
			aria-labelledby="admin-heading"
			className="mt-16 border-t border-border pt-10"
		>
			<h2 id="admin-heading" className="mb-6 text-2xl font-semibold">
				Yönetici
			</h2>

			<div className="rounded-md border border-border bg-card p-4 sm:p-6">
				<form onSubmit={save} className="space-y-3">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<label htmlFor="admin-name" className="text-sm">
							<span className="mb-1 block font-semibold">Ad</span>
							<Input
								id="admin-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</label>
						<label htmlFor="admin-author" className="text-sm">
							<span className="mb-1 block font-semibold">Yazar</span>
							<Input
								id="admin-author"
								value={author}
								onChange={(e) => setAuthor(e.target.value)}
							/>
						</label>
						<label htmlFor="admin-publisher" className="text-sm">
							<span className="mb-1 block font-semibold">Yayınevi</span>
							<Input
								id="admin-publisher"
								value={publisher}
								onChange={(e) => setPublisher(e.target.value)}
							/>
						</label>
						<label htmlFor="admin-isbn" className="text-sm">
							<span className="mb-1 block font-semibold">ISBN</span>
							<Input
								id="admin-isbn"
								value={isbn}
								onChange={(e) => setIsbn(e.target.value)}
							/>
						</label>
						<label htmlFor="admin-language" className="text-sm">
							<span className="mb-1 block font-semibold">Dil</span>
							<select
								id="admin-language"
								value={language}
								onChange={(e) =>
									setLanguage(e.target.value as "turkish" | "english")
								}
								className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
							>
								<option value="turkish">Türkçe</option>
								<option value="english">English</option>
							</select>
						</label>
						<label htmlFor="admin-category" className="text-sm">
							<span className="mb-1 block font-semibold">
								Kategoriler (virgülle)
							</span>
							<Input
								id="admin-category"
								value={category}
								onChange={(e) => setCategory(e.target.value)}
							/>
						</label>
					</div>
					<label htmlFor="admin-description" className="block text-sm">
						<span className="mb-1 block font-semibold">Açıklama</span>
						<Textarea
							id="admin-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
						/>
					</label>
					<Button type="submit">Kaydet</Button>
				</form>
			</div>

			<div className="mt-4 rounded-md border border-border bg-card p-4 sm:p-6">
				<form onSubmit={markDup} className="flex flex-col gap-2 sm:flex-row">
					<Input
						value={canonicalId}
						onChange={(e) => setCanonicalId(e.target.value)}
						placeholder="Asıl kitabın kimliği"
						aria-label="Asıl kitabın kimliği"
						className="min-w-0 flex-1"
					/>
					<Button type="submit" variant="outline">
						Kopya olarak işaretle
					</Button>
				</form>
			</div>

			<div className="mt-4 rounded-md border border-border bg-card p-4 sm:p-6">
				<Button type="button" onClick={remove} variant="destructive">
					Kitabı sil
				</Button>
			</div>

			{error ? (
				<p role="alert" className="mt-2 text-sm text-destructive">
					{error}
				</p>
			) : null}
		</section>
	);
}

function BookDetailPage() {
	const data = Route.useLoaderData();
	const { id } = Route.useParams();

	if (!data) {
		return (
			<main className="page-wrap py-24 text-center">
				<h1 className="text-4xl font-semibold">Kitap bulunamadı</h1>
				<p className="mx-auto mt-3 max-w-md text-muted-foreground">
					“{id}” kimliğine sahip bir kitap yok ya da kaldırılmış.
				</p>
				<Link
					to="/books"
					className={buttonVariants({ variant: "outline", className: "mt-8" })}
				>
					← Kitaplara dön
				</Link>
			</main>
		);
	}

	const { item, summary, ratings, myRating, isSignedIn, isAdmin } = data;
	const language = item.language === "english" ? "English" : "Türkçe";
	const average = Number(summary?.average ?? 0);
	const count = summary?.count ?? 0;
	const details = [
		["Biçim", storedBookFormat(item.fileUrl)?.toUpperCase()],
		["Yayınevi", item.publisher],
		["ISBN", item.isbn],
		["Dil", language],
		["Boyut", item.size == null ? null : formatBytes(item.size)],
	].filter((row): row is [string, string] => Boolean(row[1]));

	return (
		<main className="page-wrap pt-8 pb-4 sm:pt-10">
			<Link
				to="/books"
				className="text-sm text-muted-foreground no-underline hover:text-foreground"
			>
				← Kitaplara dön
			</Link>

			<article className="mt-8 grid gap-10 md:grid-cols-[minmax(0,280px)_1fr] md:gap-14">
				<div className="mx-auto w-full max-w-[220px] md:max-w-none">
					<BookCover
						name={item.name}
						author={item.author}
						src={item.coverThumbnail}
						priority
					/>
				</div>

				<div className="min-w-0">
					<h1 className="text-4xl leading-[1.05] font-semibold sm:text-5xl">
						{item.name}
					</h1>
					{item.author ? (
						<p className="mt-3 font-serif text-xl text-muted-foreground italic">
							{item.author}
						</p>
					) : null}

					{item.description ? (
						<p className="mt-8 max-w-prose font-serif text-lg leading-relaxed">
							{item.description}
						</p>
					) : null}

					<div className="mt-8">
						{item.fileUrl ? (
							<div className="flex flex-wrap gap-3">
								<Link
									to="/read/$id"
									params={{ id: item.id }}
									className={buttonVariants({ size: "lg" })}
								>
									Kitabı aç
								</Link>
								<a
									href={`/api/books/${encodeURIComponent(item.id)}/download?download=1`}
									className={buttonVariants({ variant: "outline", size: "lg" })}
								>
									İndir
								</a>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								Bu kitap için dosya henüz eklenmemiş.
							</p>
						)}
					</div>

					<dl className="mt-10 grid max-w-md grid-cols-[auto_1fr] border-t border-border text-sm">
						{details.map(([term, value]) => (
							<div key={term} className="contents">
								<dt className="border-b border-border py-2.5 pr-8 text-muted-foreground">
									{term}
								</dt>
								<dd className="border-b border-border py-2.5">{value}</dd>
							</div>
						))}
					</dl>

					<CategoryList categories={item.category} className="mt-5" />
				</div>
			</article>

			<section
				aria-labelledby="ratings-heading"
				className="mt-16 grid gap-8 border-t border-border pt-10 md:grid-cols-[minmax(0,280px)_1fr] md:gap-14"
			>
				<div>
					<h2 id="ratings-heading" className="text-2xl font-semibold">
						Değerlendirmeler
					</h2>
					{count > 0 ? (
						<p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
							<Stars value={average} />
							<span>
								{average.toFixed(1)} · {count} değerlendirme
							</span>
						</p>
					) : (
						<p className="mt-2 text-sm text-muted-foreground">Henüz puan yok</p>
					)}
				</div>

				<div className="min-w-0">
					{ratings.length > 0 ? (
						<ul className="divide-y divide-border border-y border-border">
							{ratings.map((entry) => (
								<li key={entry.id} className="py-5">
									<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
										<span className="font-medium">{entry.username}</span>
										<Stars value={entry.rating} />
									</div>
									{entry.review ? (
										<p className="mt-2 max-w-prose font-serif text-lg leading-relaxed">
											{entry.review}
										</p>
									) : null}
								</li>
							))}
						</ul>
					) : (
						<p className="font-serif text-lg text-muted-foreground italic">
							Henüz değerlendirme yok. İlk yorumu siz yazın.
						</p>
					)}

					<div className="mt-10 max-w-xl">
						{isSignedIn ? (
							<RatingForm bookId={item.id} initial={myRating ?? null} />
						) : (
							<p className="text-muted-foreground">
								Değerlendirmek için{" "}
								<Link to="/sign-in" search={{ redirect: `/books/${item.id}` }}>
									giriş yapın
								</Link>
								.
							</p>
						)}
					</div>
				</div>
			</section>

			{isAdmin ? <AdminPanel key={item.id} item={item} /> : null}
		</main>
	);
}
