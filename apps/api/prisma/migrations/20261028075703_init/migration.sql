-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('photo', 'text', 'barcode', 'voice');

-- CreateTable
CREATE TABLE "food_log_entries" (
    "id" UUID NOT NULL,
    "demo_user_id" TEXT NOT NULL,
    "logged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input_type" "InputType" NOT NULL,
    "input_summary" VARCHAR(200) NOT NULL,
    "food_name" VARCHAR(200) NOT NULL,
    "serving_unit" VARCHAR(100) NOT NULL,
    "serving_weight_g" DECIMAL(10,2),
    "serving_quantity" DECIMAL(10,3) NOT NULL,
    "calories_per_serving" DECIMAL(10,2),
    "protein_g_per_serving" DECIMAL(10,2),
    "carbohydrates_g_per_serving" DECIMAL(10,2),
    "fat_g_per_serving" DECIMAL(10,2),
    "calories" DECIMAL(10,1),
    "protein_g" DECIMAL(10,1),
    "carbohydrates_g" DECIMAL(10,1),
    "fat_g" DECIMAL(10,1),
    "provider" VARCHAR(20) NOT NULL,
    "passio_ref" TEXT,
    "provider_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "food_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_log_entries_demo_user_id_logged_at_idx" ON "food_log_entries"("demo_user_id", "logged_at" DESC);
