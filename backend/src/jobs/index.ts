// Barrel export for the jobs module
export {
  QUEUE_NAMES,
  signalProcessingQueue,
  scoreComputationQueue,
  webhookDeliveryQueue,
  enrichmentQueue,
  signalSyncQueue,
  workflowExecutionQueue,
  demoCleanupQueue,
  closeAllQueues,
} from './queue';

export type {
  QueueName,
  SignalProcessingJobData,
  ScoreComputationJobData,
  WebhookDeliveryJobData,
  EnrichmentJobData,
  SignalSyncJobData,
  WorkflowExecutionJobData,
  DemoCleanupJobData,
} from './queue';

export { startWorkers, stopWorkers } from './workers';

export { setupScheduler } from './scheduler';

export {
  enqueueSignalProcessing,
  enqueueScoreComputation,
  enqueueWebhookDelivery,
  enqueueEnrichment,
  enqueueSignalSync,
  enqueueSignalSyncAll,
  enqueueWorkflowExecution,
} from './producers';
