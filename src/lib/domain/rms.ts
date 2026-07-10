// Active-snippet selection via RMS (loudness/energy) analysis.
// Pure and synchronous: it takes decoded mono PCM samples and returns the window
// with the highest average energy. Decoding to PCM lives in the audio service.

export interface Snippet {
  startSec: number;
  endSec: number;
}

/**
 * Find the window of `windowSec` seconds with the maximum mean square energy
 * (equivalently max RMS, since the window length is fixed). Uses a prefix-sum of
 * squared samples so the scan is O(n).
 *
 * If the track is shorter than the window, the whole track is returned.
 */
export function selectActiveSnippet(
  samples: ArrayLike<number>,
  sampleRate: number,
  windowSec: number,
): Snippet {
  const n = samples.length;
  if (n === 0 || sampleRate <= 0) return { startSec: 0, endSec: 0 };

  const totalSec = n / sampleRate;
  const windowSamples = Math.max(1, Math.round(windowSec * sampleRate));

  if (windowSamples >= n) {
    return { startSec: 0, endSec: totalSec };
  }

  // prefix[i] = sum of squares of samples[0..i-1]
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    prefix[i + 1] = prefix[i] + s * s;
  }

  let bestStart = 0;
  let bestEnergy = -1;
  for (let start = 0; start + windowSamples <= n; start++) {
    const energy = prefix[start + windowSamples] - prefix[start];
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }

  const startSec = bestStart / sampleRate;
  return { startSec, endSec: startSec + windowSamples / sampleRate };
}
