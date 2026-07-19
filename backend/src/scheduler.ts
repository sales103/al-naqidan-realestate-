import { logger } from './config/logger.js';
import { processPendingFollowUps, updateStaleClients, notifyHotLeads } from './services/followup.service.js';

type Job = { name: string; intervalMs: number; fn: () => Promise<void>; lastRun: number; };

const jobs: Job[] = [
  { name: 'follow-ups',    intervalMs: 5 * 60 * 1000,  fn: processPendingFollowUps, lastRun: 0 },
  { name: 'stale-clients', intervalMs: 60 * 60 * 1000, fn: updateStaleClients,      lastRun: 0 },
  { name: 'hot-leads',     intervalMs: 30 * 60 * 1000, fn: notifyHotLeads,          lastRun: 0 },
];

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (schedulerInterval) return;
  logger.info('Scheduler started', { jobs: jobs.map(j => j.name) });
  schedulerInterval = setInterval(async () => {
    const now = Date.now();
    for (const job of jobs) {
      if (now - job.lastRun >= job.intervalMs) {
        job.lastRun = now;
        try { await job.fn(); } catch (err) { logger.error(`Scheduler job failed: ${job.name}`, { err }); }
      }
    }
  }, 60 * 1000);
  schedulerInterval.unref();
}

export function stopScheduler(): void {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
}
