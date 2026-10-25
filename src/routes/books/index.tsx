import { env } from "cloudflare:workers";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createDb } from "#/db";
import { bookPageInput, listBooks } from "#/lib/books";

const getBooks = createServerFn({ method: "GET" })
	.validator(bookPageInput)
	.handler(async ({ data }) => listBooks(createDb(env.DB), data));

type Search = { page?: number; q?: string };

export const Route = createFileRoute("/books/")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const raw = Number(search.page);
		const page = Number.isInteger(raw) && raw >= 1 ? raw : undefined;
		const q =
			typeof search.q === "string" && search.q.trim()
				? search.q.trim()
				: undefined;
		return { page, q };
	},
	loaderDeps: ({ search }) => ({ page: search.page ?? 1, q: search.q }),
	loader: async ({ deps }) =>
		getBooks({ data: { page: deps.page, limit: 12, q: deps.q } }),
	component: BooksPage,
});

function BooksPage() {
	const { page = 1, q } = Route.useSearch();
	const navigate = useNavigate();
	const { results, total, pageCount } = Route.useLoaderData();

	return (
		<main className="demo-page">
			<section className="mx-auto w-full max-w-5xl px-4 py-10">
				<header className="mb-8">
					<p className="island-kicker mb-2">Kitaplık</p>
					<h1 className="demo-title">Kitaplar</h1>
					<p className="demo-muted mt-2">
						{q ? (
							<>
								“{q}” için {total} sonuç.
							</>
						) : (
							<>{total} kitap listeleniyor.</>
						)}
					</p>
				</header>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						const value = String(
							new FormData(event.currentTarget).get("q") ?? "",
						).trim();
						navigate({
							to: "/books",
							search: value ? { page: 1, q: value } : { page: 1 },
						});
					}}
					className="mb-6 flex flex-col gap-2 sm:flex-row"
				>
					<input
						key={q ?? ""}
						type="search"
						name="q"
						aria-label="Kitap ara"
						defaultValue={q ?? ""}
						placeholder="Kitap, yazar veya açıklama ara..."
						className="demo-input min-w-0 flex-1"
					/>
					<button type="submit" className="demo-button whitespace-nowrap">
						Ara
					</button>
					{q ? (
						<Link
							to="/books"
							search={{ page: 1 }}
							className="demo-button whitespace-nowrap"
						>
							Temizle
						</Link>
					) : null}
				</form>

				{results.length === 0 ? (
					<p className="demo-muted py-16 text-center">
						{q
							? "Bu aramayla eşleşen kitap bulunamadı."
							: "Henüz kitap eklenmemiş."}
					</p>
				) : (
					<ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{results.map((item) => (
							<li key={item.id} className="demo-card flex flex-col gap-3 p-4">
								{item.coverThumbnail ? (
									<img
										src={item.coverThumbnail}
										alt={`${item.name} kapağı`}
										className="aspect-[2/3] w-full rounded-md object-cover"
									/>
								) : (
									<div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-[var(--link-bg-hover)] text-4xl">
										📖
									</div>
								)}
								<div>
									<h2 className="font-semibold">
										<Link
											to="/books/$id"
											params={{ id: item.id }}
											className="hover:underline"
										>
											{item.name}
										</Link>
									</h2>
									{item.author ? (
										<p className="demo-muted text-sm">{item.author}</p>
									) : null}
									{(item.category ?? []).length > 0 ? (
										<ul className="mt-2 flex flex-wrap gap-1">
											{(item.category ?? []).map((category) => (
												<li
													key={category}
													className="rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-xs"
												>
													{category}
												</li>
											))}
										</ul>
									) : null}
								</div>
							</li>
						))}
					</ul>
				)}

				{pageCount > 1 ? (
					<nav className="mt-8 flex items-center justify-between">
						{page > 1 ? (
							<Link
								to="/books"
								search={{ page: page - 1, ...(q ? { q } : {}) }}
								className="demo-button"
							>
								← Önceki
							</Link>
						) : (
							<span aria-hidden="true" />
						)}
						<span className="demo-muted text-sm">
							Sayfa {page} / {pageCount}
						</span>
						{page < pageCount ? (
							<Link
								to="/books"
								search={{ page: page + 1, ...(q ? { q } : {}) }}
								className="demo-button"
							>
								Sonraki →
							</Link>
						) : (
							<span aria-hidden="true" />
						)}
					</nav>
				) : null}
			</section>
		</main>
	);
}
