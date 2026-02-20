-- AlterTable: Add cascade delete to email_sequences -> organization
ALTER TABLE "email_sequences" DROP CONSTRAINT IF EXISTS "email_sequences_organizationId_fkey";
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add cascade delete to email_enrollments -> email_sequences
ALTER TABLE "email_enrollments" DROP CONSTRAINT IF EXISTS "email_enrollments_sequenceId_fkey";
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "email_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add cascade delete to email_enrollments -> contacts
ALTER TABLE "email_enrollments" DROP CONSTRAINT IF EXISTS "email_enrollments_contactId_fkey";
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add cascade delete to email_sends -> email_enrollments
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_enrollmentId_fkey";
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "email_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add cascade delete to email_sends -> email_sequence_steps
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_stepId_fkey";
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "email_sequence_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
