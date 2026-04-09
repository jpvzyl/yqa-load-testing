import cron from 'node-cron';
import * as db from './db.js';

const activeJobs = new Map();

export function initializeScheduler(runTestFn) {
  loadSchedules(runTestFn).catch(err => {
    console.error('[Scheduler] Failed to load schedules:', err.message);
  });
}

async function loadSchedules(runTestFn) {
  try {
    const schedules = await db.getSchedules();
    for (const schedule of schedules) {
      if (schedule.is_active) {
        registerJob(schedule, runTestFn);
      }
    }
    console.log(`[Scheduler] Loaded ${schedules.length} schedule(s)`);
  } catch (err) {
    console.warn('[Scheduler] Could not load schedules:', err.message);
  }
}

export function registerJob(schedule, runTestFn) {
  if (activeJobs.has(schedule.id)) {
    activeJobs.get(schedule.id).stop();
  }

  if (!cron.validate(schedule.cron_expression)) {
    console.warn(`[Scheduler] Invalid cron: ${schedule.cron_expression} for schedule ${schedule.id}`);
    return;
  }

  const job = cron.schedule(schedule.cron_expression, async () => {
    console.log(`[Scheduler] Triggering test for schedule ${schedule.id}`);
    try {
      await runTestFn(schedule.test_id, {
        trigger: 'scheduled',
        trigger_meta: { schedule_id: schedule.id },
      });

      await db.updateSchedule(schedule.id, {
        last_run_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[Scheduler] Failed to run scheduled test: ${err.message}`);
    }
  }, {
    timezone: schedule.timezone || 'UTC',
  });

  activeJobs.set(schedule.id, job);
}

export function unregisterJob(scheduleId) {
  const job = activeJobs.get(scheduleId);
  if (job) {
    job.stop();
    activeJobs.delete(scheduleId);
  }
}

export function getActiveJobCount() {
  return activeJobs.size;
}

export function stopAll() {
  for (const [id, job] of activeJobs) {
    job.stop();
  }
  activeJobs.clear();
}
