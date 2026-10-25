/**
 * NextProblem - Web Worker Prediction Service Wrapper
 * Manages communication between React components and the background worker.
 */

import { CFProblem, CFSubmission, CFUser, ExportedModel } from '../types';
import { WorkerInputPayload, WorkerOutputPayload } from '../workers/predictor.worker';

export class PredictionService {
  private static worker: Worker | null = null;

  private static getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/predictor.worker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return this.worker;
  }

  static runInference(
    user: CFUser,
    submissions: CFSubmission[],
    problems: CFProblem[],
    modelWeights: ExportedModel
  ): Promise<WorkerOutputPayload> {
    return new Promise((resolve, reject) => {
      const worker = this.getWorker();

      const handleMessage = (event: MessageEvent<WorkerOutputPayload>) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        resolve(event.data);
      };

      const handleError = (error: ErrorEvent) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        reject(error);
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      const payload: WorkerInputPayload = {
        user,
        submissions,
        problems,
        modelWeights
      };

      worker.postMessage(payload);
    });
  }
}
