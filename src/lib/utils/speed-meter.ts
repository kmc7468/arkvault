// Estimates the transfer rate in bytes per second from the total transferred bytes
export const createSpeedMeter = (timeWindow = 3000, minInterval = 200, warmupPeriod = 500) => {
  const samples: { t: number; b: number }[] = [];
  let lastSpeed = 0;
  let startTime: number | null = null;

  return (bytesNow?: number) => {
    if (bytesNow === undefined) return lastSpeed;

    const now = performance.now();

    // Initialize start time on first call
    if (startTime === null) {
      startTime = now;
    }

    // Check if enough time has passed since the last sample
    const lastSample = samples[samples.length - 1];
    if (lastSample && now - lastSample.t < minInterval) {
      return lastSpeed;
    }

    samples.push({ t: now, b: bytesNow });

    // Remove old samples outside the time window
    const cutoff = now - timeWindow;
    while (samples.length > 2 && samples[0]!.t < cutoff) samples.shift();

    // Need at least 2 samples to calculate speed
    if (samples.length < 2) {
      return lastSpeed;
    }

    const first = samples[0]!;
    const dt = now - first.t;
    const db = bytesNow - first.b;

    if (dt >= minInterval) {
      const instantSpeed = (db / dt) * 1000;
      // Apply EMA for smoother speed transitions
      const alpha = 0.3;
      const rawSpeed =
        lastSpeed === 0 ? instantSpeed : alpha * instantSpeed + (1 - alpha) * lastSpeed;

      // Apply warmup ramp to prevent initial overestimation
      const elapsed = now - startTime;
      const warmupWeight = Math.min(1, elapsed / warmupPeriod);
      lastSpeed = rawSpeed * warmupWeight;
    }

    return lastSpeed;
  };
};
