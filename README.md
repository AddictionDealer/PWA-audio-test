# pwa-audio-demo

A minimal Progressive Web App (PWA) that demonstrates two ways to play an audio file:

1. **Stream** directly from the remote URL.
2. **Download & play offline** – the file is cached using the Cache API and served by the Service Worker.  
   The next time you tap "Play Offline", the audio is loaded from local storage even without network connectivity.

## Getting started

```bash
npm install -g http-server
http-server -p 8080
```

Then open `http://localhost:8080` in your browser and **"Install"** the app from the address bar (Chrome/Edge) or
using the browser menu (Firefox).

## How it works

* `service-worker.js` caches the app shell on install.
* When you tap **Download & Play Offline**, the audio file is fetched and added to a dedicated `audio-cache-v1`.
* For any later fetch of the `.m4a` file, the Service Worker tries the cache first, then the network.
* The UI detects whether the track is already cached to toggle the button text.

Built on 2025-07-03.