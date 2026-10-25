import { env } from "cloudflare:workers";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createDb } from "#/db";
import { bookPageInput, listBooks } from "#/lib/books";

const getBooks = createServerFn({ method: "GET" })
	.validator(bookPageInput)
	.handler(async ({ data }) => listBooks(createDb(env.DB), data));

type Search = { page: number };

export const Route = createFileRoute("/books")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const raw = Number(search.page);
		const page = Number.isInteger(raw) && raw >= 1 ? raw : 1;
		return { page };
	},
	loaderDeps: ({ search }) => ({ page: search.page }),
	loader: async ({ deps }) =>
		getBooks({ data: { page: deps.page, limit: 12 } }),
	component: BooksPage,
});

function BooksPage() {
	const { page } = Route.useSearch();
	const { results, total, pageCount } = Route.useLoaderData();

	return (
		<main className="demo-page">
			<section className="mx-auto w-full max-w-5xl px-4 py-10">
				<header className="mb-8">
					<p className="island-kicker mb-2">Kitaplık</p>
					<h1 className="demo-title">Kitaplar</h1>
					<p className="demo-muted mt-2">{total} kitap listeleniyor.</p>
				</header>

				{results.length === 0 ? (
					<p className="demo-muted py-16 text-center">
						Henüz kitap eklenmemiş.
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
									<h2 className="font-semibold">{item.name}</h2>
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
								search={{ page: page - 1 }}
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
								search={{ page: page + 1 }}
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
