import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: class {
    send = send;
  },
  UpdateServiceCommand: class {
    constructor(public input: unknown) {}
  },
}));

import {
  ensureWorkerRunning,
  scaleToZeroIfDrained,
  workerScalingEnabled,
} from "../src/lib/worker-scaling.js";

/** The desiredCount of each UpdateService call made so far, in order. */
function desiredCounts(): number[] {
  return send.mock.calls.map(
    ([cmd]) => (cmd as { input: { desiredCount: number } }).input.desiredCount,
  );
}

describe("worker-scaling", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    process.env.ECS_CLUSTER_NAME = "careerops";
    process.env.WORKER_SERVICE_NAME = "careerops-worker";
  });

  afterEach(() => {
    delete process.env.ECS_CLUSTER_NAME;
    delete process.env.WORKER_SERVICE_NAME;
  });

  it("is disabled, and calls nothing, unless both env vars are set", async () => {
    delete process.env.WORKER_SERVICE_NAME;

    expect(workerScalingEnabled()).toBe(false);
    await ensureWorkerRunning();
    expect(await scaleToZeroIfDrained(async () => 0)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("asks ECS for one worker task on the configured service", async () => {
    await ensureWorkerRunning();

    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0][0] as { input: unknown }).input).toEqual({
      cluster: "careerops",
      service: "careerops-worker",
      desiredCount: 1,
    });
  });

  it("never throws when ECS rejects the request", async () => {
    send.mockRejectedValue(new Error("AccessDenied"));

    await expect(ensureWorkerRunning()).resolves.toBeUndefined();
  });

  it("leaves the worker running while anything is Queued or Running", async () => {
    expect(await scaleToZeroIfDrained(async () => 2)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("scales to zero when the queue is drained", async () => {
    expect(await scaleToZeroIfDrained(async () => 0)).toBe(true);
    expect(desiredCounts()).toEqual([0]);
  });

  it("re-requests the worker when a job arrives during the scale-down", async () => {
    const countPending = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    expect(await scaleToZeroIfDrained(countPending)).toBe(false);
    expect(desiredCounts()).toEqual([0, 1]);
  });

  it("propagates a failed scale-down so the caller can retry", async () => {
    send.mockRejectedValue(new Error("Throttled"));

    await expect(scaleToZeroIfDrained(async () => 0)).rejects.toThrow("Throttled");
  });
});
