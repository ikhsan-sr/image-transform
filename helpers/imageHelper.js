const sharp = require('sharp');

async function compressImage(buffer, width, quality, format = 'original') {
  try {
    const transformer = sharp(buffer).resize(width);
    return format === 'webp'
      ? await transformer.webp({ quality }).toBuffer()
      : await transformer.toBuffer();
  } catch (error) {
    console.error('Error compressing image:', error);
    throw new Error('Failed to compress image');
  }
}

module.exports = { compressImage };
