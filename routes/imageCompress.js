const express = require('express');
const path = require('path');

const { downloadImage } = require('../utils/downloadUtils');
const { compressImage } = require('../helpers/imageHelper');
const { uploadToS3 } = require('../helpers/s3Helper');

const { IMAGE_DIRECTORY, MAX_SIZE } = require('../constants/imageConstants');
const SIZES = require('../constants/sizeConstants');

const router = express.Router();

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

router.get('/compress', async (req, res, next) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const originalBuffer = await downloadImage(url);
    const filename = path.basename(url, path.extname(url));
    const originalExt = path.extname(url).split('.').pop();
    const encodedUri = encodeURIComponent(filename);

    const originalKey = `${IMAGE_DIRECTORY}/${encodedUri}.${originalExt}`;
    await uploadToS3(originalBuffer, originalKey);

    const outputUrls = {
      max: `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_max.${originalExt}`
    };

    const maxBuffer = await compressImage(originalBuffer, MAX_SIZE, 80);
    const maxKey = `${IMAGE_DIRECTORY}/${encodedUri}_max.${originalExt}`;
    await uploadToS3(maxBuffer, maxKey);

    await Promise.all(SIZES.map(async ({ size, width, quality }) => {
      const outputBufferWebP = await compressImage(originalBuffer, width, quality, 'webp');
      const outputKeyWebP = `${IMAGE_DIRECTORY}/${encodedUri}_${size}.webp`;
      await uploadToS3(outputBufferWebP, outputKeyWebP);

      const outputBufferOriginal = await compressImage(originalBuffer, width, quality);
      const outputKeyOriginal = `${IMAGE_DIRECTORY}/${encodedUri}_${size}.${originalExt}`;
      await uploadToS3(outputBufferOriginal, outputKeyOriginal);

      outputUrls[size] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_${size}.${originalExt}`;
      outputUrls[`${size}_webp`] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_${size}.webp`;
    }));

    res.json(outputUrls);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
