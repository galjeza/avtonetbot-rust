import fs from 'node:fs';

import axios from 'axios';
import Jimp from 'jimp';
import { ColorActionName } from '@jimp/plugin-color';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36';

export async function downloadImage(url: string, outputPath: string): Promise<void> {
  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    fs.writeFileSync(outputPath, response.data);
  } catch {
    // Matches the previous behaviour: a failed download leaves no file and the
    // upload step reports the shortfall rather than aborting the whole run.
  }
}

/**
 * Softens and desaturates a photo so the re-uploaded ad is not byte-identical
 * to the one it replaces. Kept exactly as the previous version had it — the
 * numbers here are tuned, not arbitrary.
 */
export async function reduceSharpnessDesaturateAndBlurEdges(imagePath: string): Promise<void> {
  const image = await Jimp.read(imagePath);

  const blurredImage = image.clone().gaussian(1);
  image.composite(blurredImage, 0, 0, {
    mode: Jimp.BLEND_OVERLAY,
    opacitySource: 0.5,
    opacityDest: 0.5,
  });

  image.color([{ apply: ColorActionName.DESATURATE, params: [4] }]);

  const edgeWidth = 2;
  const heavilyBlurredEdgesImage = image.clone().gaussian(1);
  const center = image
    .clone()
    .crop(
      edgeWidth,
      edgeWidth,
      image.bitmap.width - 2 * edgeWidth,
      image.bitmap.height - 2 * edgeWidth,
    );
  heavilyBlurredEdgesImage.composite(center, edgeWidth, edgeWidth);

  await heavilyBlurredEdgesImage.writeAsync(imagePath);
}
