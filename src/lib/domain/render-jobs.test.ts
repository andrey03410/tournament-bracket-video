import { describe, it, expect } from "vitest";
import { isActiveRenderJob, renderJobDto } from "./render-jobs";

describe("isActiveRenderJob", () => {
  it("считает активными queued и running", () => {
    expect(isActiveRenderJob("queued")).toBe(true);
    expect(isActiveRenderJob("running")).toBe(true);
  });

  it("считает завершёнными done и failed", () => {
    expect(isActiveRenderJob("done")).toBe(false);
    expect(isActiveRenderJob("failed")).toBe(false);
  });
});

describe("renderJobDto", () => {
  const base = { id: "job1", status: "running", progress: 0.5, error: null, outputPath: null };

  it("маппит поля и не даёт ссылку без готового файла", () => {
    expect(renderJobDto(base)).toEqual({
      id: "job1",
      status: "running",
      progress: 0.5,
      error: null,
      downloadUrl: null,
    });
  });

  it("даёт ссылку на скачивание при наличии outputPath", () => {
    const dto = renderJobDto({ ...base, status: "done", progress: 1, outputPath: "renders/job1.mp4" });
    expect(dto.downloadUrl).toBe("/api/render-jobs/job1/download");
  });

  it("пробрасывает ошибку упавшего задания", () => {
    const dto = renderJobDto({ ...base, status: "failed", error: "boom" });
    expect(dto.status).toBe("failed");
    expect(dto.error).toBe("boom");
    expect(dto.downloadUrl).toBeNull();
  });
});
