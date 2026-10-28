-- CreateEnum
CREATE TYPE "MealPlanStatus" AS ENUM ('preview', 'generating', 'ready', 'failed');

-- AlterEnum
ALTER TYPE "InputType" ADD VALUE 'meal_plan';

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" UUID NOT NULL,
    "demo_user_id" TEXT NOT NULL,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'preview',
    "days" INTEGER NOT NULL,
    "notes" VARCHAR(300),
    "profile_snapshot" JSONB NOT NULL,
    "preview_payload" JSONB NOT NULL,
    "plan_payload" JSONB,
    "shopping_list_humanized" JSONB,
    "error_code" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_plans_demo_user_id_created_at_idx" ON "meal_plans"("demo_user_id", "created_at" DESC);
