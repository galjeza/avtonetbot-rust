export const wait = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Random pause, in seconds, to avoid a machine-perfect rhythm. */
export const randomWait = (min: number, max: number): Promise<void> =>
  wait(Math.random() * (max - min) + min);
