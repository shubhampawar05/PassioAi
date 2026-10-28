-- CreateEnum
CREATE TYPE "NutritionGoal" AS ENUM ('balanced', 'more_protein', 'more_fiber', 'more_vegetables', 'steady_energy');

-- CreateTable
CREATE TABLE "nutrition_profiles" (
    "id" UUID NOT NULL,
    "demo_user_id" TEXT NOT NULL,
    "goal" "NutritionGoal" NOT NULL DEFAULT 'balanced',
    "daily_calorie_target" INTEGER,
    "diet_preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoid_foods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nutrition_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_profiles_demo_user_id_key" ON "nutrition_profiles"("demo_user_id");
