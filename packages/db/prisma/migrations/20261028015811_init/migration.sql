-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'TEMPLATE_EDITOR', 'SUPPORT');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BusinessUserRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('BASIC', 'BUSINESS', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('PSD', 'LAYER', 'COMPOSITE', 'UPLOAD', 'RENDER', 'THUMB', 'FONT', 'BRAND', 'QA_DIFF');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DesignFormat" AS ENUM ('png', 'jpg', 'pdf');

-- CreateEnum
CREATE TYPE "DesignQuality" AS ENUM ('standard', 'hd');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('MONTHLY_GRANT', 'SPEND', 'ADMIN_ADJUST', 'REFUND');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'TEMPLATE_EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'SA',
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "planId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUser" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "BusinessUserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "businessId" UUID NOT NULL,
    "logoAssetId" UUID,
    "logoLightAssetId" UUID,
    "colors" JSONB NOT NULL DEFAULT '{}',
    "fontIds" UUID[],
    "phone" TEXT,
    "website" TEXT,
    "social" JSONB NOT NULL DEFAULT '{}',
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "BusinessAiProfile" (
    "businessId" UUID NOT NULL,
    "activityDescription" TEXT,
    "writingTone" TEXT,
    "audience" TEXT,
    "market" TEXT,
    "visualStyle" TEXT,
    "forbidden" TEXT,
    "customInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessAiProfile_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" JSONB NOT NULL,
    "monthlyAiCredits" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "source" "SubscriptionSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" UUID,
    "tags" TEXT[],
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "TemplateVisibility" NOT NULL DEFAULT 'PUBLIC',
    "minPlan" "PlanCode" NOT NULL DEFAULT 'BASIC',
    "activityTypes" TEXT[],
    "currentVersionId" UUID,
    "draftData" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "duplicatedFromId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateAccess" (
    "templateId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateAccess_pkey" PRIMARY KEY ("templateId","businessId")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "variants" JSONB NOT NULL,
    "fieldsHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Font" (
    "id" UUID NOT NULL,
    "family" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 400,
    "style" TEXT NOT NULL DEFAULT 'normal',
    "assetId" UUID NOT NULL,
    "aliases" TEXT[],
    "scripts" TEXT[],
    "license" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Font_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "jobId" UUID,
    "templateId" UUID,
    "sourceAssetId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "report" JSONB,
    "document" JSONB,
    "qaScore" DOUBLE PRECISION,
    "qaDiffAssetId" UUID,
    "qaRenderAssetId" UUID,
    "error" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID,
    "templateVersionId" UUID NOT NULL,
    "variantId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "renderHash" TEXT NOT NULL,
    "format" "DesignFormat" NOT NULL,
    "quality" "DesignQuality" NOT NULL,
    "outputAssetId" UUID,
    "thumbAssetId" UUID,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCreditLedger" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRequest" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "templateVersionId" UUID,
    "fieldKey" TEXT,
    "action" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUser_email_key" ON "BusinessUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUser_phone_key" ON "BusinessUser"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

-- CreateIndex
CREATE INDEX "Template_status_visibility_idx" ON "Template"("status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "Font_aliases_idx" ON "Font" USING GIN ("aliases");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_key_key" ON "Asset"("key");

-- CreateIndex
CREATE INDEX "Asset_ownerType_ownerId_idx" ON "Asset"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- CreateIndex
CREATE INDEX "Design_businessId_createdAt_idx" ON "Design"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Design_renderHash_idx" ON "Design"("renderHash");

-- CreateIndex
CREATE INDEX "AiCreditLedger_businessId_createdAt_idx" ON "AiCreditLedger"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUser" ADD CONSTRAINT "BusinessUser_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAiProfile" ADD CONSTRAINT "BusinessAiProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAccess" ADD CONSTRAINT "TemplateAccess_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAccess" ADD CONSTRAINT "TemplateAccess_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Font" ADD CONSTRAINT "Font_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditLedger" ADD CONSTRAINT "AiCreditLedger_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
