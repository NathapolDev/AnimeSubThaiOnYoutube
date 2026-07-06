function safeExternalUrl(value, fallback = '#') {
  try {
    const url = new URL(String(value || ''));
    const hostname = url.hostname.toLowerCase();
    const allowedHost = hostname === 'youtu.be'
      || hostname === 'youtube.com'
      || hostname.endsWith('.youtube.com')
      || hostname === 'myanimelist.net'
      || hostname.endsWith('.myanimelist.net')
      || hostname === 'crunchyroll.com'
      || hostname.endsWith('.crunchyroll.com')
      || hostname === 'bilibili.tv'
      || hostname.endsWith('.bilibili.tv')
      || hostname === 'netflix.com'
      || hostname.endsWith('.netflix.com');

    return url.protocol === 'https:' && allowedHost ? url.href : fallback;
  } catch {
    return fallback;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { safeExternalUrl };
