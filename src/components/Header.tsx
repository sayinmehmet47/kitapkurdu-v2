import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import BetterAuthHeader from "../integrations/better-auth/header-user.tsx";
import ThemeToggle from "./ThemeToggle";

const navLink =
	"text-foreground no-underline decoration-2 underline-offset-[10px] hover:text-primary data-[status=active]:underline data-[status=active]:decoration-primary";

export default function Header() {
	const navigate = useNavigate();
	// Home and the catalog have their own search field; avoid two on one page.
	const hasPageSearch = useRouterState({
		select: (state) => /^\/(books\/?)?$/.test(state.location.pathname),
	});

	return (
		<header className="border-b border-border bg-background">
			<div className="page-wrap flex flex-wrap items-center gap-x-8 gap-y-3 pt-4 pb-3 sm:py-5">
				<Link
					to="/"
					className="font-serif text-[1.65rem] leading-none font-semibold tracking-tight text-foreground no-underline"
				>
					KitapKurdu
				</Link>

				<nav
					aria-label="Ana menü"
					className="order-last flex w-full gap-6 border-t border-border pt-3 text-[0.95rem] font-medium sm:order-none sm:w-auto sm:border-0 sm:pt-0"
				>
					<Link to="/books" className={navLink}>
						Kitaplar
					</Link>
					<Link to="/shelf" className={navLink}>
						Raf Alanı
					</Link>
				</nav>

				<div className="ml-auto flex items-center gap-2">
					{hasPageSearch ? null : (
						<>
							<search className="hidden md:block">
								<form
									onSubmit={(event) => {
										event.preventDefault();
										const q = String(
											new FormData(event.currentTarget).get("q") ?? "",
										).trim();
										event.currentTarget.reset();
										navigate({
											to: "/books",
											search: q ? { page: 1, q } : { page: 1 },
										});
									}}
									className="relative"
								>
									<Search
										aria-hidden="true"
										className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
									/>
									<input
										type="search"
										name="q"
										aria-label="Kitaplarda ara"
										placeholder="Kitap veya yazar ara"
										className="h-9 w-60 rounded-md border border-input bg-card pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
									/>
								</form>
							</search>
							<Link
								to="/books"
								search={{ page: 1 }}
								aria-label="Kitaplarda ara"
								className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
							>
								<Search aria-hidden="true" className="size-[1.15rem]" />
							</Link>
						</>
					)}
					<BetterAuthHeader />
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
