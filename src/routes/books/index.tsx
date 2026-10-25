import { env } from "cloudflare:workers";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BookCard } from "#/components/books/BookCard";
import { Button, buttonVariants } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { createDb } from "#/db";
import { bookPageInput, listBooks, listCategories } from "#/lib/books";

const getBooks = createServerFn({ method: "GET" })
	.validator(bookPageInput)
	.handler(async ({ data }) => listBooks(createDb(env.DB), data));

const getCategories = createServerFn({ method: "GET" }).handler(async () =>
	listCategories(createDb(env.DB)),
);

type Search = {
	page?: number;
	q?: string;
	language?: "turkish" | "english";
	category?: string;
};

export const Route = createFileRoute("/books/")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const raw = Number(search.page);
		const page = Number.isInteger(raw) && raw >= 1 ? raw : undefined;
		const q =
			typeof search.q === "string" && search.q.trim()
				? search.q.trim()
				: undefined;
		const language =
			search.language === "turkish" || search.language === "english"
				? search.language
				: undefined;
		const category =
			typeof search.category === "string" && search.category.trim()
				? search.category.trim()
				: undefined;
		return { page, q, language, category };
	},
	loaderDeps: ({ search }) => ({
		page: search.page ?? 1,
		q: search.q,
		language: search.language,
		category: search.category,
	}),
	loader: async ({ deps }) => {
		const [books, categories] = await Promise.all([
			getBooks({
				data: {
					page: deps.page,
					limit: 12,
					q: deps.q,
					language: deps.language,
					category: deps.category,
				},
			}),
			getCategories(),
		]);
		return { ...books, categories };
	},
	component: BooksPage,
});

function BooksPage() {
	const { page = 1, q, language, category } = Route.useSearch();
	const navigate = useNavigate();
	const { results, total, pageCount, categories } = Route.useLoaderData();

	const searchFor = (next: Partial<Search>) => ({
		page: 1,
		...(q ? { q } : {}),
		...(language ? { language } : {}),
		...(category ? { category } : {}),
		...next,
	});

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
					<Link
						to="/books/new"
						className={buttonVariants({ className: "mt-4" })}
					>
						Kitap Ekle
					</Link>
				</div>

				<div className="w-full md:max-w-md">
					<search>
						<form
							onSubmit={(event) => {
								event.preventDefault();
								const value = String(
									new FormData(event.currentTarget).get("q") ?? "",
								).trim();
								navigate({
									to: "/books",
									search: searchFor({ q: value || undefined }),
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
									search={searchFor({ q: undefined })}
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

					<div className="mt-3 flex flex-wrap gap-3">
						<label className="flex items-center gap-2 text-sm">
							<span className="text-muted-foreground">Dil</span>
							<select
								aria-label="Dile göre filtrele"
								value={language ?? ""}
								onChange={(event) => {
									const value = event.target.value;
									navigate({
										to: "/books",
										search: searchFor({
											language:
												value === "turkish" || value === "english"
													? value
													: undefined,
										}),
									});
								}}
								className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<option value="">Tüm diller</option>
								<option value="turkish">Türkçe</option>
								<option value="english">English</option>
							</select>
						</label>

						<label className="flex items-center gap-2 text-sm">
							<span className="text-muted-foreground">Kategori</span>
							<select
								aria-label="Kategoriye göre filtrele"
								value={category ?? ""}
								onChange={(event) =>
									navigate({
										to: "/books",
										search: searchFor({
											category: event.target.value || undefined,
										}),
									})
								}
								className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<option value="">Tüm kategoriler</option>
								{categories.map((item) => (
									<option key={item} value={item}>
										{item}
									</option>
								))}
							</select>
						</label>
					</div>
				</div>
			</header>

			{results.length === 0 ? (
				<div className="py-24 text-center">
					<p className="font-serif text-2xl">
						{q || language || category
							? "Filtrelerle eşleşen kitap bulunamadı."
							: "Henüz kitap eklenmemiş."}
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
							search={searchFor({ page: page - 1 })}
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
							search={searchFor({ page: page + 1 })}
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
