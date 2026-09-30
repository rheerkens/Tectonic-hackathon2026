CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"employee_name" text NOT NULL,
	"employee_number" text NOT NULL,
	"period" text NOT NULL,
	"country" text NOT NULL,
	"client" text,
	"gross_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_employee_period_idx" ON "payslips" USING btree ("project_id","employee_number","period");