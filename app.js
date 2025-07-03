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

async function fetchHtmlThroughProxy(targetUrl) {
  // Adjust this endpoint to match your proxy setup
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}.json`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error('Failed to fetch HTML');
  return await response.text();
}

async function createList() {
  const container = document.getElementById('trackList');
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;">Title</th>
          <th style="text-align:left;">Artist</th>
          <th style="text-align:left;">Duration</th>
          <th style="text-align:left;">Actions</th>
        </tr>
      </thead>
      <tbody id="trackTableBody"></tbody>
    </table>
    <audio id="mainAudio" controls style="width:100%;margin-top:1rem;display:none;"></audio>
  `;
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

    playBtn.addEventListener('click', () => {
      mainAudio.src = track.url;
      mainAudio.style.display = 'block';
      mainAudio.play();
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
      mainAudio.style.display = 'block';
      mainAudio.play();
    });

    soundgasmBtn.addEventListener('click', async () => {
      soundgasmBtn.disabled = true;
      soundgasmBtn.textContent = 'Searching...';
      try {
        const html = await fetchHtmlThroughProxy(redditUrl);
        // Debug: dump HTML content to console
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