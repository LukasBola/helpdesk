-- CreateEnum
CREATE TYPE "AiResultState" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "ai_interactions" ADD COLUMN     "error" TEXT,
ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "aiLocale" TEXT;

-- CreateTable
CREATE TABLE "ticket_ai_results" (
    "ticketId" TEXT NOT NULL,
    "state" "AiResultState" NOT NULL,
    "error" TEXT,
    "suggestedPriority" "TicketPriority",
    "customerLanguage" TEXT,
    "draft" TEXT,
    "summaryPl" TEXT,
    "summaryEn" TEXT,
    "draftTranslationPl" TEXT,
    "draftTranslationEn" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_ai_results_pkey" PRIMARY KEY ("ticketId")
);

-- AddForeignKey
ALTER TABLE "ticket_ai_results" ADD CONSTRAINT "ticket_ai_results_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

