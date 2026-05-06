/// <reference lib="webworker" />

import type { Project } from '../model/schema';
import { simulateProjectYear, type AnnualSimulationResult } from './annualSimulation';

interface AnnualSimulationWorkerRequest {
  project: Project;
  options?: {
    year?: number;
  };
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', async (event: MessageEvent<AnnualSimulationWorkerRequest>) => {
  try {
    const result: AnnualSimulationResult = await simulateProjectYear(event.data.project, {
      year: event.data.options?.year ?? 2025,
    });
    workerScope.postMessage({ result });
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : 'Jaarberekening mislukt' });
  }
});
