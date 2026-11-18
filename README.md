# What your music looks like

This app shows the music I listened to in the **last 24 hours** on Last.fm as a **map**,
a bit like a territory conquest game. Every album I listen to is a territory on an island,
and the territory gets bigger each time I play a song from this album.
When I listen to a new album, a new territory appears on the map.
With the timeline under the map, you can go back in time and replay how my day of music grew.

**Online:** https://student12.wt.thomasjuldo.com/lastfm/

## What you need

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Compose is included)
- A Last.fm account and an API key: <https://www.last.fm/api/account/create>

## How to run it

```bash
cp .env.example .env        # then open .env and put your API key and your Last.fm username
docker compose up --build
```

Then open <http://localhost:3000>.

## On the server

The app runs on the same server as my other project,
[visit-counter](https://github.com/AlexHAGT/visit-counter). Its Caddy receives all the visitors
and sends the requests starting with `/lastfm/` to this app (see its `Caddyfile`).
`compose.server.yaml` removes the port of the app, so only Caddy is open to the internet,
and it connects the app to the Docker network of visit-counter, so Caddy can reach it.
The links in the page are relative (`api/tracks`, not `/api/tracks`), so they also work under `/lastfm/`.

To put an update online, I commit and push from my laptop, then on the server:

```
cd ~/lastfm-map
git pull
docker compose -f compose.yaml -f compose.server.yaml up -d --build
```

The `.env` file with the API key was created by hand on the server, it is not on GitHub.

## How it works

```
Browser  ──►  My server (Express, in Docker)  ──►  Last.fm
         ◄──   /api/tracks, /api/cover         ◄──
```

- **The browser only talks to my server.** The page calls `/api/tracks`, and my server
  is the one who calls Last.fm with the API key. The key is in the `.env` file
  (environment variable). This file is never committed and it is not copied in the Docker image.
- **The album covers also go through my server** (`/api/cover?url=...`). This route only
  accepts Last.fm image domains, so nobody can use it to download other things.
  Because of that, you don't see any request to Last.fm in the Network tab.
- **Cache**: the server keeps the Last.fm answer in memory for `CACHE_TTL_SECONDS`
  (60 seconds by default). If you reload the page many times during this time, Last.fm is called
  only once. The server console prints `CACHE HIT` or `CACHE MISS → appel Last.fm`, and the
  response has an `X-Cache` header.
- **If Last.fm is down**: the request has a 5 second timeout. If it fails, the server sends back
  the last data it has in cache (even if it is expired) with `stale: true`, and the page shows a
  message at the top of the map. If there is nothing in the cache, the server answers with a clean
  503 error and the page shows a message instead of a blank screen.

### Simulate a Last.fm outage

In `.env`, add `LASTFM_BASE_URL=https://adresse-invalide.example/`, then run
`docker compose up -d --force-recreate`. Remove the line to go back to normal.

## The map

- The map is a grid of 160 × 100 cells, drawn in a `<canvas>`. The canvas is made bigger with
  `image-rendering: pixelated`, so the cells stay real little squares.
- The island is generated from a fixed seed, so it is the same island every time.
- I replay my plays in order, from the oldest to the newest. The first time an album is played,
  it gets a capital on a free cell. Then every play gives it more cells around its capital.
  After each play I save a "snapshot" of the map. The slider and the ▶ button just show
  these snapshots, this is how you can go back in time.
- Each territory is painted with the pixels of its album cover (the cover is reduced to 32 × 32).
- When you hover a territory, its border becomes white and a small window shows the cover,
  the artist and the songs I played.

## Project structure

```
server/index.js        Express server: /api/tracks, /api/cover routes and static files
server/lastfm.js       call to Last.fm and cleaning of the answer
server/cache.js        in-memory cache with an expiry time
public/monde.js        generates the world (land and water) from a fixed seed
public/territoires.js  simulation: each play gives cells to its album
public/app.js          gets /api/tracks, draws the map, hover window and timeline
```

The code comments are in French, because it's my native language.
