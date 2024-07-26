const axios = require('axios');

function isValidUrl(url) {
  const urlRegex = /^(https?:\/\/)[\w.-]+\.[a-z]{2,}(\/[\w.-]*)*\/?$/i;
  return urlRegex.test(url);
}

async function isImage(url) {
  try {
    const response = await axios.head(url);
    const contentType = response.headers['content-type'];
    return contentType && contentType.startsWith('image/');
  } catch (error) {
    console.error('Error validating image URL:', error);
    return false;
  }
}

async function validateImageUrl(url) {
  if (!url) {
    return { isValid: false, message: 'URL is required' };
  }

  if (!isValidUrl(url)) {
    return { isValid: false, message: 'Invalid URL format' };
  }

  if (!await isImage(url)) {
    return { isValid: false, message: 'URL does not point to a valid image' };
  }

  return { isValid: true, message: 'Valid URL' };
}

module.exports = { validateImageUrl };