import { useState, useEffect } from 'react';
import type { ScheduleProgram } from '../types';
import { fetchSchedule } from '../api';

export function useSchedule(intervalMs = 30000) {
  const [programs, setPrograms] = useState<ScheduleProgram[]>([]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const data = await fetchSchedule();
        if (active) setPrograms(data.programs);
      } catch {
        // ignore
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return programs;
}
