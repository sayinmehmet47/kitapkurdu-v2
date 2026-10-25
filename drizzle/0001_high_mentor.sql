CREATE TABLE `book` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`author` text,
	`isbn` text,
	`publisher` text,
	`description` text,
	`category` text DEFAULT '[]',
	`language` text DEFAULT 'turkish' NOT NULL,
	`file_url` text,
	`size` integer,
	`cover_small_thumbnail` text,
	`cover_thumbnail` text,
	`uploader_id` text,
	`duplicate_of_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `book_name_idx` ON `book` (`name`);--> statement-breakpoint
CREATE INDEX `book_author_idx` ON `book` (`author`);--> statement-breakpoint
CREATE INDEX `book_uploader_idx` ON `book` (`uploader_id`);--> statement-breakpoint
CREATE INDEX `book_created_idx` ON `book` (`created_at`);