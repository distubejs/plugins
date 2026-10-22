<div align="center">
  <p>
    <a href="https://nodei.co/npm/@distube/youtube"><img src="https://nodei.co/npm/@distube/youtube.png?downloads=true&downloadRank=true&stars=true"></a>
  </p>
  <p>
    <a href="https://nodei.co/npm/@distube/youtube"><img alt="npm peer dependency version" src="https://img.shields.io/npm/dependency-version/@distube/youtube/peer/distube?style=flat-square"></a>
    <a href="https://nodei.co/npm/@distube/youtube"><img alt="npm" src="https://img.shields.io/npm/dt/@distube/youtube?logo=npm&style=flat-square"></a>
    <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/distubejs/plugins?logo=github&logoColor=white&style=flat-square">
    <a href="https://discord.gg/feaDd9h"><img alt="Discord" src="https://img.shields.io/discord/732254550689316914?logo=discord&logoColor=white&style=flat-square"></a>
  </p>
  <p>
    <a href='https://ko-fi.com/skick' target='_blank'><img height='48' src='https://storage.ko-fi.com/cdn/kofi3.png' alt='Buy Me a Coffee at ko-fi.com' /></a>
  </p>
</div>

# @distube/youtube

A DisTube extractor plugin for supporting YouTube.

[_What is an extractor plugin?_](https://github.com/skick1234/DisTube/wiki/Projects-Hub#plugins)

## Feature

- Scraping YouTube data without using API key
- Support YouTube video playlists and channel uploads
- Search on YouTube
- Play video directly from YouTube

## Requirements

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range [`@distube/ytdl-core`](https://github.com/distubejs/ytdl-core) 5 supports.

## Usage

### Plugin

```ts
import { DisTube } from "distube";
import { YouTubePlugin } from "@distube/youtube";

const distube = new DisTube(client, {
  plugins: [new YouTubePlugin()],
});
```

### Search

```ts
import { DisTube } from "distube";
import { YouTubePlugin } from "@distube/youtube";

const youtubePlugin = new YouTubePlugin({
  cookies: [
    // ...
  ],
});

const distube = new DisTube(client, {
  plugins: [youtubePlugin],
});

const results = await distube.search("test", { type: "video", limit: 10 });
console.log(results);
```

## Documentation

### YouTubePlugin

#### YouTubePlugin([YouTubePluginOptions])

- `YoutubePluginOptions.cookies`: (Optional) YouTube cookies. See: [How to get YouTube cookies](https://github.com/skick1234/DisTube/wiki/YouTube-Cookies)
- `YoutubePluginOptions.ytdlOptions`: (Optional) [`@distube/ytdl-core` options](https://distube.js.org/ytdl-core/guides/getting-started/), such as `lang`, `clients` or `getPoToken`. `cookies` replaces its `cookie`.

#### YouTubePlugin#search(query, [options]): Promise<Song[]|SearchResultPlaylist[]>

- `query`: Search query string
- `options`: Search options
- `options.type`: Type of results (`video` or `playlist`)
- `options.limit`: Maximum number of results to return
- `options.safeSearch`: Whether or not use safe search (YouTube restricted mode)

#### SearchResultPlaylist

- `id`: Playlist ID
- `name`: Playlist name
- `url`: Playlist URL
- `length`: Number of videos in the playlist, `0` when YouTube does not show it
- `uploader`: Playlist owner
- `uploader.name`: Playlist owner name
- `uploader.url`: Playlist owner URL
