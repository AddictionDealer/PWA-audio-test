const CACHE_NAME = 'audio-cache-v1';

async function isCached(requestUrl) {
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(requestUrl, {ignoreSearch: true});
  return !!match;
}

async function cacheTrack(requestUrl) {
  const cache = await caches.open(CACHE_NAME);
  await cache.add(requestUrl);
}

async function fetchTracks() {
  const response = await fetch('https://corsproxy.io/?https://gwasi.com/delta.json');
  if (!response.ok) throw new Error('Failed to fetch track list');
  return response.json();
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
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${track.title || ''}</td>
      <td>${track.artist || ''}</td>
      <td>${track.duration || ''}</td>
      <td>
        <button id="play-${track.id}">Play</button>
        <button id="download-${track.id}">Download & Play Offline</button>
      </td>
    `;
    tbody.appendChild(tr);

    const playBtn = tr.querySelector(`#play-${track.id}`);
    const dlBtn = tr.querySelector(`#download-${track.id}`);

    // Disable download button if already cached
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
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

createList();