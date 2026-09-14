export const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const wait = (seconds: number): Promise<void> => waitMs(seconds * 1000);
