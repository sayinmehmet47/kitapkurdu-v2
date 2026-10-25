import { env } from "cloudflare:workers";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { insertUserTodo, listUserTodos, todoInput } from "#/lib/todos";

const getTodos = createServerFn({
	method: "GET",
}).handler(async () => {
	const session = await getAuth().api.getSession({
		headers: getRequestHeaders(),
	});
	if (!session) return null;
	return listUserTodos(createDb(env.DB), session.user.id);
});

const createTodo = createServerFn({
	method: "POST",
})
	.validator(todoInput)
	.handler(async ({ data }) => {
		const session = await getAuth().api.getSession({
			headers: getRequestHeaders(),
		});
		if (!session) throw new Error("Sign in before creating a todo.");
		await insertUserTodo(createDb(env.DB), session.user.id, data);
		return { success: true };
	});

export const Route = createFileRoute("/demo/drizzle")({
	component: DemoDrizzle,
	loader: async () => await getTodos(),
});

function DemoDrizzle() {
	const router = useRouter();
	const todos = Route.useLoaderData();

	if (todos === null) {
		return (
			<main className="demo-page demo-center">
				<section className="demo-panel w-full max-w-2xl">
					<h1 className="demo-title">Your D1 database demo</h1>
					<p className="demo-muted my-4">
						Sign in to create todos saved to your own account.
					</p>
					<Link to="/demo/better-auth" className="demo-button">
						Sign in
					</Link>
				</section>
			</main>
		);
	}

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const title = formData.get("title") as string;

		if (!title) return;

		try {
			await createTodo({ data: { title } });
			router.invalidate();
			(e.target as HTMLFormElement).reset();
		} catch (error) {
			console.error("Failed to create todo:", error);
		}
	};

	return (
		<main className="demo-page demo-center">
			<section className="demo-panel w-full max-w-2xl">
				<header className="mb-8 flex items-center gap-4">
					<span className="demo-card flex h-14 w-14 items-center justify-center p-3">
						<img src="/drizzle.svg" alt="Drizzle Logo" className="h-8 w-8" />
					</span>
					<div>
						<p className="island-kicker mb-2">Database</p>
						<h1 className="demo-title">Drizzle Demo</h1>
					</div>
				</header>

				<h2 className="demo-section-title mb-4">Todos</h2>

				<ul className="space-y-3 mb-6">
					{todos.map((todo) => (
						<li key={todo.id} className="demo-list-item">
							<div className="flex items-center justify-between">
								<span className="font-medium">{todo.title}</span>
								<span className="demo-muted text-xs">#{todo.id}</span>
							</div>
						</li>
					))}
					{todos.length === 0 && (
						<li className="demo-list-item text-center demo-muted">
							No todos yet. Create one below!
						</li>
					)}
				</ul>

				<form
					onSubmit={handleSubmit}
					className="flex flex-col gap-2 sm:flex-row"
				>
					<input
						type="text"
						name="title"
						placeholder="Add a new todo..."
						className="demo-input min-w-0 flex-1"
					/>
					<button type="submit" className="demo-button whitespace-nowrap">
						Add Todo
					</button>
				</form>

				<div className="demo-card mt-8">
					<h3 className="demo-section-title mb-2">Powered by Drizzle ORM</h3>
					<p className="demo-muted mb-4 text-sm">
						Type-safe SQL with Cloudflare D1 and Drizzle. Todos are private to
						your account.
					</p>
					<div className="space-y-2 text-sm">
						<p className="font-medium">Setup Instructions:</p>
						<ol className="demo-muted list-inside list-decimal space-y-2">
							<li>
								Apply local migrations: <code>npm run db:migrate</code>
							</li>
							<li>Sign in, then add a todo above.</li>
							<li>
								Refresh the page or restart the dev server; your data stays
								saved.
							</li>
							<li>
								After changing the schema: <code>npm run db:generate</code>,
								then <code>npm run db:migrate</code>.
							</li>
						</ol>
					</div>
				</div>
			</section>
		</main>
	);
}
