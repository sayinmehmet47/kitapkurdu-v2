import { Link } from "@tanstack/react-router";
import { BookCover } from "./BookCover";
import { CategoryList } from "./CategoryList";

type BookCardProps = {
	book: {
		id: string;
		name: string;
		author: string | null;
		category: string[] | null;
		coverThumbnail: string | null;
	};
	priority?: boolean;
	/** Heading level for the title, so cards fit under the page's outline. */
	titleAs?: "h2" | "h3";
};

export function BookCard({
	book,
	priority,
	titleAs: Title = "h2",
}: BookCardProps) {
	return (
		<article className="group relative flex flex-col">
			<BookCover
				name={book.name}
				author={book.author}
				src={book.coverThumbnail}
				priority={priority}
				className="transition-transform duration-200 group-hover:-translate-y-0.5"
			/>
			<Title className="mt-4 text-lg leading-snug font-semibold">
				{/* The stretched link makes the whole card, cover included, clickable. */}
				<Link
					to="/books/$id"
					params={{ id: book.id }}
					className="text-foreground no-underline after:absolute after:inset-0 group-hover:underline group-hover:decoration-primary"
				>
					{book.name}
				</Link>
			</Title>
			{book.author ? (
				<p className="mt-0.5 text-sm text-muted-foreground">{book.author}</p>
			) : null}
			<CategoryList categories={book.category} className="mt-3" />
		</article>
	);
}
