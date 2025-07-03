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

// Helper to render collapsible subreddit list under the search bar
function renderSubredditList(allTracks, selectedSubs = null) {
  // Count occurrences for each subreddit
  const subredditCounts = {};
  allTracks.forEach(track => {
    subredditCounts[track.subreddit] = (subredditCounts[track.subreddit] || 0) + 1;
  });

  // Sort subreddits by count (descending), then alphabetically
  const subreddits = Object.entries(subredditCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // By default, only the most popular subreddit is enabled
  if (!selectedSubs) {
    selectedSubs = new Set([subreddits[0][0]]);
  }

  let filterContainer = document.getElementById('subredditListContainer');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'subredditListContainer';
    const trackList = document.getElementById('trackList');
    trackList.parentNode.insertBefore(filterContainer, trackList);
  }

  // Count enabled subreddits for summary
  const enabledCount = selectedSubs.size;
  const totalCount = subreddits.length;

  filterContainer.innerHTML = `
    <details style="margin: 1rem 0; width:100%;" ${enabledCount === 1 ? '' : 'open'}>
      <summary style="font-weight:bold;cursor:pointer;">
        Show Subreddits (${enabledCount} of ${totalCount} enabled)
      </summary>
      <div id="subredditFilterList" style="display:flex;flex-wrap:wrap;gap:0.5em 1em;margin:0.5rem 0 0 0; width:100%;">
        ${subreddits.map(([sub, count], idx) => `
          <label style="display:inline-flex;align-items:center;font-size:0.95em;padding:0.15em 0.5em;background:#f5f5f5;border-radius:4px;margin-bottom:0.25em;cursor:pointer;">
            <input type="checkbox" class="subreddit-filter" value="${sub}" style="margin-right:0.3em;" ${selectedSubs.has(sub) ? 'checked' : ''}>
            ${sub} <span style="color:#888;font-size:0.9em;margin-left:0.3em;">(${count})</span>
          </label>
        `).join('')}
      </div>
    </details>
  `;

  // Add event listeners for filtering
  document.querySelectorAll('.subreddit-filter').forEach(cb => {
    cb.addEventListener('change', () => {
      const checkedSubs = new Set(
        Array.from(document.querySelectorAll('.subreddit-filter:checked')).map(cb => cb.value)
      );
      renderSubredditList(allTracks, checkedSubs);
      createList(document.getElementById('searchInput').value, checkedSubs);
    });
  });

  // Return the set of selected subreddits for use in createList
  return selectedSubs;
}

let allTracks = [];

async function createList(filter = '', selectedSubs = null) {
  const tbody = document.getElementById('trackTableBody');
  const mainAudio = document.getElementById('mainAudio');

  // Only fetch once, cache for filtering
  if (!allTracks.length) {
    try {
      allTracks = await fetchTracks();
      selectedSubs = renderSubredditList(allTracks); // Render subreddit list ONCE after fetching
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4">Failed to load tracks.</td></tr>`;
      return;
    }
  } else if (!selectedSubs) {
    // If not first load, get checked subreddits from DOM
    selectedSubs = new Set(
      Array.from(document.querySelectorAll('.subreddit-filter:checked')).map(cb => cb.value)
    );
  }

  // Filter tracks by title or author and selected subreddits
  const tracks = allTracks.filter(track =>
    (track.title.toLowerCase().includes(filter.toLowerCase()) ||
     track.author.toLowerCase().includes(filter.toLowerCase())) &&
    selectedSubs.has(track.subreddit)
  );

  tbody.innerHTML = '';
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

// Add search event listener
document.getElementById('searchInput').addEventListener('input', (e) => {
  createList(e.target.value);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

// Cache delta.json on load
cacheDeltaFile();

// Initial call to populate the list
createList();