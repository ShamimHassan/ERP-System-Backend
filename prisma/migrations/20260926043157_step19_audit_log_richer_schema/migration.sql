/*
  Warnings:

  - You are about to drop the column `ipAddress` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `newValue` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `oldValue` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `recordId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `AuditLog` table. All the data in the column will be lost.
  - Added the required column `actorId` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actorRole` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `module` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AuditModule" AS ENUM ('USERS', 'LEADS', 'CUSTOMERS', 'OPPORTUNITIES', 'ACTIVITIES', 'SURVEYS', 'PRODUCTS', 'PRICES', 'QUOTATIONS', 'SALES_ORDERS', 'KPI_TARGETS', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PRICE_APPROVAL_SUBMIT';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'CONVERT';

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropIndex
DROP INDEX "AuditLog_module_recordId_idx";

-- DropIndex
DROP INDEX "AuditLog_userId_action_createdAt_idx";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "ipAddress",
DROP COLUMN "newValue",
DROP COLUMN "oldValue",
DROP COLUMN "recordId",
DROP COLUMN "userId",
ADD COLUMN     "actorId" TEXT NOT NULL,
ADD COLUMN     "actorRole" "Role" NOT NULL,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityLabel" TEXT,
ADD COLUMN     "relatedUserId" TEXT,
ADD COLUMN     "summary" TEXT,
DROP COLUMN "module",
ADD COLUMN     "module" "AuditModule" NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_actorId_action_createdAt_idx" ON "AuditLog"("actorId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_entityId_idx" ON "AuditLog"("module", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_relatedUserId_idx" ON "AuditLog"("relatedUserId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
