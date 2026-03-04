CREATE TABLE `failed_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_order_id` text NOT NULL,
	`order_number` integer NOT NULL,
	`shopify_payload` text NOT NULL,
	`error_reason` text,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `master_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `product_variants` ADD `bundle_multiplier` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `master_product_id` integer REFERENCES master_products(id);