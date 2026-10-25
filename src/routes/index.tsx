import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return (
		<main className="page-wrap pt-14 pb-8">
			<section className="border-b border-border pb-12">
				<p className="island-kicker mb-3">TanStack Start Base Template</p>
				<h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-foreground sm:text-6xl">
					Start simple, ship quickly.
				</h1>
				<p className="mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
					This base starter intentionally keeps things light: two routes, clean
					structure, and the essentials you need to build from scratch.
				</p>
				<div className="flex flex-wrap gap-3">
					<a href="/about" className="demo-button">
						About This Starter
					</a>
					<a
						href="https://tanstack.com/router"
						target="_blank"
						rel="noopener noreferrer"
						className="demo-button demo-button-secondary"
					>
						Router Guide
					</a>
				</div>
			</section>

			<section className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
				{[
					[
						"Type-Safe Routing",
						"Routes and links stay in sync across every page.",
					],
					[
						"Server Functions",
						"Call server code from your UI without creating API boilerplate.",
					],
					[
						"Streaming by Default",
						"Ship progressively rendered responses for faster experiences.",
					],
					[
						"Tailwind Native",
						"Design quickly with utility-first styling and reusable tokens.",
					],
				].map(([title, desc]) => (
					<article key={title} className="border-t border-border pt-4">
						<h2 className="mb-2 text-base font-semibold text-foreground">
							{title}
						</h2>
						<p className="m-0 text-sm text-muted-foreground">{desc}</p>
					</article>
				))}
			</section>

			<section className="mt-12 border-t border-border pt-6">
				<p className="island-kicker mb-2">Quick Start</p>
				<ul className="m-0 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
					<li>
						Edit <code>src/routes/index.tsx</code> to customize the home page.
					</li>
					<li>
						Update <code>src/components/Header.tsx</code> and{" "}
						<code>src/components/Footer.tsx</code> for brand links.
					</li>
					<li>
						Add routes in <code>src/routes</code> and tweak visual tokens in{" "}
						<code>src/styles.css</code>.
					</li>
				</ul>
			</section>
		</main>
	);
}
