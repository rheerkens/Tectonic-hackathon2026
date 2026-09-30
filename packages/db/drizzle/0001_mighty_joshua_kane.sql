ALTER TABLE "sources" ADD COLUMN "disputed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "disputed_by_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_disputed_by_id_users_id_fk" FOREIGN KEY ("disputed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;