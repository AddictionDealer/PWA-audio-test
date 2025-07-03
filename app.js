const tracks = [
  {
    id: 'sample',
    title: 'Sample Audio',
    url: 'https://corsproxy.io/?https://media.soundgasm.net/sounds/0957e1382930fa02a7cf7a07ff2adad9dc17c5f7.m4a'
  }
];

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

async function createList() {
  const ul = document.getElementById('trackList');
  for (const track of tracks) {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${track.title}</strong>
      <audio id="audio-${track.id}" controls style="width: 100%; margin-top: .5rem;"></audio>
      <button id="stream-${track.id}">Stream</button>
      <button id="download-${track.id}">Download & Play Offline</button>
    `;
    ul.appendChild(li);

    const audioElem = li.querySelector(`#audio-${track.id}`);
    const streamBtn = li.querySelector(`#stream-${track.id}`);
    const dlBtn = li.querySelector(`#download-${track.id}`);

    // Disable download button if already cached
    if (await isCached(track.url)) {
      dlBtn.textContent = 'Play Offline';
    }

    streamBtn.addEventListener('click', () => {
      audioElem.src = track.url;
      audioElem.play();
    });

    dlBtn.addEventListener('click', async () => {
      if (!(await isCached(track.url))) {
        dlBtn.disabled = true;
        dlBtn.textContent = 'Downloading...';
        await cacheTrack(track.url);
        dlBtn.textContent = 'Play Offline';
        dlBtn.disabled = false;
      }
      // The service worker will intercept and serve from cache
      audioElem.src = track.url;
      audioElem.play();
    });
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

createList();