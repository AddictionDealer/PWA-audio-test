const CACHE_NAME = 'audio-cache-v1';
const DELTA_URL = 'https://corsproxy.io/?https://gwasi.com/delta.json';

async function isCached(requestUrl) {
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(requestUrl, {ignoreSearch: true});
  return !!match;
}

async function cacheTrack(requestUrl) {
  const cache = await caches.open(CACHE_NAME);
  await cache.add(requestUrl);
}

async function cacheDeltaFile() {
  const cache = await caches.open(CACHE_NAME);
  await cache.add(DELTA_URL);
}

async function fetchTracks() {
  // Try to get delta.json from cache first
  const cache = await caches.open(CACHE_NAME);
  let response = await cache.match(DELTA_URL);
  if (!response) {
    response = await fetch(DELTA_URL);
    if (response.ok) {
      await cache.put(DELTA_URL, response.clone());
    } else {
      throw new Error('Failed to fetch track list');
    }
  }
  const data = await response.json();
  // Map each entry array to an object with named fields
  return (data.entries || []).map(entry => ({
    id: entry[0],
    subreddit: entry[1],
    author: entry[2],
    flair: entry[3],
    title: entry[4], // 5th item is the title
    timestamp: entry[5],
    duration: entry[6],
    comments: entry[7],
    user: entry[8],
    url: `https://gwasi.com/audio/${entry[0]}.m4a`
  }));
}

function extractSoundgasmLinks(html) {
  // Use DOMParser to parse the HTML and extract all soundgasm.net links
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const links = Array.from(doc.querySelectorAll('a[href*="soundgasm.net"]'))
    .map(a => a.href);
  // Improved regex: stops at ), and other common delimiters
  const urlRegex = /https?:\/\/soundgasm\.net\/[^\s"'<>)]+/g;
  const rawMatches = html.match(urlRegex) || [];
  // Combine and deduplicate
  return Array.from(new Set([...links, ...rawMatches]));
}

// Add this helper function near your other extract helpers
function extractM4aLinks(html) {
  // Find all .m4a links in the HTML
  const urlRegex = /https?:\/\/[^"'<> )]+\.m4a/g;
  return html.match(urlRegex) || [];
}

async function fetchHtmlThroughProxy(targetUrl) {
  // If the target is a Reddit link, append .json for easier parsing
  let fetchUrl = targetUrl;
  if (/^https:\/\/(www\.)?reddit\.com\//.test(targetUrl)) {
    // Remove any trailing slash before appending .json
    fetchUrl = fetchUrl.replace(/\/$/, '') + '.json';
  }
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(fetchUrl)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error('Failed to fetch HTML');
  // If it's a Reddit .json, parse and extract the selftext_html or body_html
  if (fetchUrl.endsWith('.json')) {
    const json = await response.json();
    // Try to extract the post body HTML (for posts) or comment body HTML (for comments)
    let html = '';
    if (Array.isArray(json) && json[0]?.data?.children?.[0]?.data?.selftext_html) {
      html = json[0].data.children[0].data.selftext_html;
    } else if (json?.data?.children?.[0]?.data?.selftext_html) {
      html = json.data.children[0].data.selftext_html;
    }
    // Fallback: stringify if nothing found
    return html || JSON.stringify(json);
  } else {
    return await response.text();
  }
}

async function createList() {
  // No need to set container.innerHTML here
  const tbody = document.getElementById('trackTableBody');
  const mainAudio = document.getElementById('mainAudio');

  let tracks = [];
  try {
    tracks = await fetchTracks();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">Failed to load tracks.</td></tr>`;
    return;
  }

  for (const track of tracks) {
    const redditUrl = `https://www.reddit.com/r/${track.subreddit}/comments/${track.id}/`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${track.title || ''}</td>
      <td>${track.author || ''}</td>
      <td>${track.duration || ''}</td>
      <td>
        <button id="play-${track.id}">Play</button>
        <button id="download-${track.id}">Download & Play Offline</button>
        <a href="${redditUrl}" target="_blank" rel="noopener" id="reddit-${track.id}">
          <button>Reddit Link</button>
        </a>
        <button id="soundgasm-${track.id}">Soundgasm</button>
      </td>
    `;
    tbody.appendChild(tr);

    const playBtn = tr.querySelector(`#play-${track.id}`);
    const dlBtn = tr.querySelector(`#download-${track.id}`);
    const soundgasmBtn = tr.querySelector(`#soundgasm-${track.id}`);

    if (await isCached(track.url)) {
      dlBtn.textContent = 'Play Offline';
    }

    playBtn.addEventListener('click', async () => {
      playBtn.disabled = true;
      playBtn.textContent = 'Loading...';
      try {
        const redditHtml = await fetchHtmlThroughProxy(redditUrl);
        const soundgasmLinks = extractSoundgasmLinks(redditHtml);

        if (soundgasmLinks.length > 0) {
          const soundgasmHtml = await fetchHtmlThroughProxy(soundgasmLinks[0]);
          const m4aLinks = extractM4aLinks(soundgasmHtml);

          if (m4aLinks.length > 0) {
            track.url = m4aLinks[0];
            mainAudio.src = track.url;
            mainAudio.play();
          } else {
            alert('No .m4a audio link found on Soundgasm page.');
          }
        } else {
          alert('No soundgasm.net links found on Reddit post.');
        }
      } catch (err) {
        alert('Error fetching or extracting audio link.');
      }
      playBtn.textContent = 'Play';
      playBtn.disabled = false;
    });

    dlBtn.addEventListener('click', async () => {
      if (!(await isCached(track.url))) {
        dlBtn.disabled = true;
        dlBtn.textContent = 'Downloading...';
        await cacheTrack(track.url);
        dlBtn.textContent = 'Play Offline';
        dlBtn.disabled = false;
      }
      mainAudio.src = track.url;
      mainAudio.play();
    });

    soundgasmBtn.addEventListener('click', async () => {
      soundgasmBtn.disabled = true;
      soundgasmBtn.textContent = 'Searching...';
      try {
        const html = await fetchHtmlThroughProxy(redditUrl);
        const soundgasmLinks = extractSoundgasmLinks(html);
        if (soundgasmLinks.length > 0) {
          window.open(soundgasmLinks[0], '_blank', 'noopener');
        } else {
          alert('No soundgasm.net links found on Reddit post.');
        }
      } catch (err) {
        alert('Error fetching Reddit post or extracting soundgasm link.');
      }
      soundgasmBtn.textContent = 'Soundgasm';
      soundgasmBtn.disabled = false;
    });
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

// Cache delta.json on load
cacheDeltaFile();

createList();