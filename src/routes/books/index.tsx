import { env } from "cloudflare:workers";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BookCard } from "#/components/books/BookCard";
import { Button, buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
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
		<main className="page-wrap pt-10 pb-4 sm:pt-14">
			<header className="flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
				<div>
					<h1 className="text-4xl leading-none font-semibold sm:text-5xl">
						Kitaplar
					</h1>
					<p className="mt-3 text-muted-foreground">
						{q ? (
							<>
								“{q}” için {total} sonuç
							</>
						) : (
							<>Kitaplıkta {total} kitap var</>
						)}
					</p>
				</div>

				<search className="w-full md:max-w-md">
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
						className="flex gap-2"
					>
						<Input
							key={q ?? ""}
							type="search"
							name="q"
							aria-label="Kitap ara"
							defaultValue={q ?? ""}
							placeholder="Kitap, yazar veya açıklama ara"
							className="h-10 bg-card"
						/>
						<Button type="submit" className="h-10">
							Ara
						</Button>
						{q ? (
							<Link
								to="/books"
								search={{ page: 1 }}
								className={buttonVariants({
									variant: "outline",
									className: "h-10",
								})}
							>
								Temizle
							</Link>
						) : null}
					</form>
				</search>
			</header>

			{results.length === 0 ? (
				<div className="py-24 text-center">
					<p className="font-serif text-2xl">
						{q ? "Bu aramayla eşleşen kitap yok." : "Henüz kitap eklenmemiş."}
					</p>
					{q ? (
						<p className="mt-2 text-muted-foreground">
							Başka bir başlık, yazar ya da ISBN deneyin.
						</p>
					) : null}
				</div>
			) : (
				<ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-10 lg:gap-y-14">
					{results.map((item, index) => (
						<li key={item.id}>
							<BookCard book={item} priority={index < 4} />
						</li>
					))}
				</ul>
			)}

			{pageCount > 1 ? (
				<nav
					aria-label="Sayfalar"
					className="mt-14 flex items-center justify-between border-t border-border pt-6"
				>
					{page > 1 ? (
						<Link
							to="/books"
							search={{ page: page - 1, ...(q ? { q } : {}) }}
							className={buttonVariants({ variant: "outline" })}
						>
							← Önceki
						</Link>
					) : (
						<span aria-hidden="true" />
					)}
					<span className="text-sm text-muted-foreground">
						Sayfa {page} / {pageCount}
					</span>
					{page < pageCount ? (
						<Link
							to="/books"
							search={{ page: page + 1, ...(q ? { q } : {}) }}
							className={buttonVariants({ variant: "outline" })}
						>
							Sonraki →
						</Link>
					) : (
						<span aria-hidden="true" />
					)}
				</nav>
			) : null}
		</main>
	);
}
