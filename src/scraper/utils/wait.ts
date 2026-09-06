export const wait = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
