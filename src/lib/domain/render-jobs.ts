// Render job DTO shared by the job-status API routes and the constructor UIs.

export interface RenderJobDto {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  downloadUrl: string | null;
}

/** A job the UI should keep polling (render still in flight). */
export function isActiveRenderJob(status: string): boolean {
  return status === "queued" || status === "running";
}

export function renderJobDto(job: {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  outputPath: string | null;
}): RenderJobDto {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    downloadUrl: job.outputPath ? `/api/render-jobs/${job.id}/download` : null,
  };
}
