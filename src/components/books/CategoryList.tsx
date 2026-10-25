import { cn } from "#/lib/utils";

export function CategoryList({
	categories,
	className,
}: {
	categories: string[] | null | undefined;
	className?: string;
}) {
	if (!categories || categories.length === 0) return null;

	return (
		<ul
			aria-label="Kategoriler"
			className={cn("flex flex-wrap gap-1.5", className)}
		>
			{categories.map((category) => (
				<li
					key={category}
					className="rounded-sm border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground"
				>
					{category}
				</li>
			))}
		</ul>
	);
}
