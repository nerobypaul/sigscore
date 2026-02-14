-- CreateTable
CREATE TABLE "email_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sequence_steps" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 1,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_enrollments" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "email_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "messageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_sequences_organizationId_idx" ON "email_sequences"("organizationId");

-- CreateIndex
CREATE INDEX "email_sequences_status_idx" ON "email_sequences"("status");

-- CreateIndex
CREATE INDEX "email_sequence_steps_sequenceId_idx" ON "email_sequence_steps"("sequenceId");

-- CreateIndex
CREATE UNIQUE INDEX "email_sequence_steps_sequenceId_stepNumber_key" ON "email_sequence_steps"("sequenceId", "stepNumber");

-- CreateIndex
CREATE INDEX "email_enrollments_sequenceId_idx" ON "email_enrollments"("sequenceId");

-- CreateIndex
CREATE INDEX "email_enrollments_contactId_idx" ON "email_enrollments"("contactId");

-- CreateIndex
CREATE INDEX "email_enrollments_status_idx" ON "email_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_enrollments_sequenceId_contactId_key" ON "email_enrollments"("sequenceId", "contactId");

-- CreateIndex
CREATE INDEX "email_sends_enrollmentId_idx" ON "email_sends"("enrollmentId");

-- CreateIndex
CREATE INDEX "email_sends_stepId_idx" ON "email_sends"("stepId");

-- CreateIndex
CREATE INDEX "email_sends_status_idx" ON "email_sends"("status");

-- AddForeignKey
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sequence_steps" ADD CONSTRAINT "email_sequence_steps_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "email_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "email_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "email_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "email_sequence_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
