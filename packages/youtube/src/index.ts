import { setTimeout as sleep } from "node:timers/promises";
import {
  type Chapter,
  type PlaylistInfo,
  type PlaylistSummary,
  SearchType,
  type Storyboard,
  type Thumbnail,
  type VideoInfo,
  type VideoSummary,
  Ytdl,
  type YtdlOptions,
  parsePlaylistId,
  parseVideoId,
} from "@distube/ytdl-core";
import {
  DisTubeError,
  ExtractorPlugin,
  Playlist,
  type ResolveOptions,
  Song,
  type SongInfo,
  checkInvalidKey,
} from "distube";

const CHANNEL =
  /^(?:UC[\w-]{22}|https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:channel\/UC[\w-]{22}|@[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)\/?(?:[?#].*)?)$/u;

/**
 * A browser cookie, as cookie export extensions write it. Only `name` and `value` are sent.
 */
export interface Cookie {
  name: string;
  value: string;
  [key: string]: unknown;
}

export type YouTubePluginOptions = {
  /**
   * YouTube Cookies
   */
  cookies?: Cookie[];
  /**
   * `@distube/ytdl-core` options. `cookies` replaces its `cookie`.
   */
  ytdlOptions?: YtdlOptions;
};

const cookieHeader = (cookies: Cookie[] | undefined) =>
  cookies?.length ? cookies.map(c => `${c.name}=${c.value}`).join("; ") : undefined;

const largest = (thumbnails: readonly Thumbnail[]) =>
  thumbnails.toSorted((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;

const summaryInfo = (plugin: YouTubePlugin, info: VideoSummary): SongInfo => ({
  plugin,
  source: "youtube",
  playFromSource: true,
  id: info.id,
  name: info.title,
  url: info.url,
  thumbnail: largest(info.thumbnails),
  isLive: info.isLive,
  duration: info.isLive ? 0 : (info.lengthSeconds ?? 0),
  views: info.viewCount ?? 0,
  uploader: { name: info.author.name, url: info.author.url },
});

type SearchOptions = { type?: SearchResultType; limit?: number; safeSearch?: boolean };

export class YouTubePlugin extends ExtractorPlugin {
  cookies?: Cookie[];
  #cookies?: Cookie[];
  #ytdlOptions: YtdlOptions;
  #ytdl: Ytdl;

  constructor(options: YouTubePluginOptions = {}) {
    super();
    checkInvalidKey(options, ["cookies", "ytdlOptions"], "YouTubePlugin");
    this.cookies = this.#cookies = options.cookies ? [...options.cookies] : undefined;
    this.#ytdlOptions = { ...options.ytdlOptions };
    this.#ytdl = this.#create();
  }

  #create(): Ytdl {
    return new Ytdl({ ...this.#ytdlOptions, cookie: cookieHeader(this.#cookies) ?? this.#ytdlOptions.cookie });
  }

  /**
   * The `@distube/ytdl-core` instance, rebuilt when {@link YouTubePlugin.cookies} is replaced.
   */
  get ytdl(): Ytdl {
    if (this.cookies !== this.#cookies) {
      this.#cookies = this.cookies;
      this.#ytdl = this.#create();
    }
    return this.#ytdl;
  }

  get ytdlOptions(): YtdlOptions {
    return this.#ytdlOptions;
  }

  get ytCookie(): string {
    return cookieHeader(this.cookies) ?? this.#ytdlOptions.cookie ?? "";
  }

  validate(url: string): boolean {
    return Boolean(parseVideoId(url) || parsePlaylistId(url) || CHANNEL.test(url));
  }

  async resolve<T>(url: string, options: ResolveOptions<T>) {
    if (parsePlaylistId(url) || CHANNEL.test(url)) {
      return new YouTubePlaylist(this, await this.ytdl.getPlaylist(url), options);
    }
    if (parseVideoId(url)) return new YouTubeSong(this, await this.ytdl.getInfo(url), options);
    throw new DisTubeError("CANNOT_RESOLVE_SONG", url);
  }

  async getStreamURL<T = unknown>(song: YouTubeSong<T>): Promise<string> {
    if (!song.url || !parseVideoId(song.url)) throw new DisTubeError("CANNOT_RESOLVE_SONG", song);
    const info = await this.ytdl.getInfo(song.url);
    if (!info.formats.length) throw new DisTubeError("UNAVAILABLE_VIDEO");
    const newSong = new YouTubeSong(this, info, {});
    song.ageRestricted = newSong.ageRestricted;
    song.views = newSong.views;
    song.likes = newSong.likes;
    song.thumbnail = newSong.thumbnail;
    song.related = newSong.related;
    song.chapters = newSong.chapters;
    song.storyboards = newSong.storyboards;
    const format = info.formats
      .filter(f => f.url && f.hasAudio && (!newSong.isLive || f.isHLS))
      .toSorted((a, b) => Number(b.audioBitrate) - Number(a.audioBitrate) || Number(a.bitrate) - Number(b.bitrate))[0];
    if (!format?.url) throw new DisTubeError("UNPLAYABLE_FORMATS");
    // YouTube answers media requests with 403 until an enforced preroll ends.
    await sleep(Math.max(0, info.playableAt - Date.now()));
    return format.url;
  }

  async getRelatedSongs(song: YouTubeSong): Promise<Song[]> {
    const related = song.related ?? (await this.ytdl.getRelated(song.id));
    return related.map(r => new YouTubeRelatedSong(this, r));
  }

  async searchSong<T>(query: string, options: ResolveOptions<T>): Promise<Song<T> | null> {
    const [info] = await this.ytdl.search(query, { limit: 1 });
    return info ? new Song(summaryInfo(this, info), options) : null;
  }

  search(
    string: string,
    options?: { type?: SearchResultType.VIDEO; limit?: number; safeSearch?: boolean },
  ): Promise<YouTubeSearchResultSong[]>;
  search(
    string: string,
    options: { type: SearchResultType.PLAYLIST; limit?: number; safeSearch?: boolean },
  ): Promise<YouTubeSearchResultPlaylist[]>;
  search(string: string, options?: SearchOptions): Promise<YouTubeSearchResultSong[] | YouTubeSearchResultPlaylist[]>;
  /**
   * Search for a song.
   *
   * @param query              - The string search for
   * @param options            - Search options
   * @param options.limit      - Limit the results
   * @param options.type       - Type of results (`video` or `playlist`).
   * @param options.safeSearch - Whether or not use safe search (YouTube restricted mode)
   *
   * @returns Array of results
   */
  async search(
    query: string,
    { type = SearchResultType.VIDEO, limit = 10, safeSearch = false }: SearchOptions = {},
  ): Promise<YouTubeSearchResultSong[] | YouTubeSearchResultPlaylist[]> {
    if (type === SearchResultType.PLAYLIST) {
      const playlists = await this.ytdl.search(query, { type: SearchType.Playlist, limit, safeSearch });
      return playlists.map(p => new YouTubeSearchResultPlaylist(p));
    }
    const videos = await this.ytdl.search(query, { limit, safeSearch });
    return videos.map(v => new YouTubeSearchResultSong(this, v));
  }
}

export class YouTubeSong<T = unknown> extends Song<T> {
  chapters?: readonly Chapter[];
  storyboards?: readonly Storyboard[];
  related?: readonly VideoSummary[];
  constructor(plugin: YouTubePlugin, info: VideoInfo, options: ResolveOptions<T>) {
    const i = info.videoDetails;
    super(
      {
        plugin,
        source: "youtube",
        playFromSource: true,
        id: i.id,
        name: i.title,
        isLive: i.isLive,
        duration: i.isLive ? 0 : i.lengthSeconds,
        url: i.url,
        thumbnail: largest(i.thumbnails),
        views: i.viewCount ?? 0,
        likes: i.likes ?? 0,
        uploader: { name: i.author.name, url: i.author.url },
        ageRestricted: i.isAgeRestricted,
      },
      options,
    );
    this.chapters = i.chapters;
    this.storyboards = i.storyboards;
    this.related = info.relatedVideos;
  }
}

export class YouTubePlaylist<T> extends Playlist<T> {
  constructor(plugin: YouTubePlugin, info: PlaylistInfo, options: ResolveOptions<T>) {
    super(
      {
        source: "youtube",
        id: info.id,
        name: info.title,
        url: info.url,
        thumbnail: largest(info.thumbnails),
        songs: info.videos.map(v => new Song(summaryInfo(plugin, v))),
      },
      options,
    );
  }
}

export class YouTubeRelatedSong extends Song {
  constructor(plugin: YouTubePlugin, info: VideoSummary) {
    super(summaryInfo(plugin, info));
  }
}

/**
 * Search result types:
 *
 * - `VIDEO` = `"video"`
 * - `PLAYLIST` = `"playlist"`
 */
export enum SearchResultType {
  VIDEO = "video",
  PLAYLIST = "playlist",
}

/**
 * A class representing a video search result.
 */
export class YouTubeSearchResultSong extends Song {
  constructor(plugin: YouTubePlugin, info: VideoSummary) {
    super(summaryInfo(plugin, info));
  }
}

/**
 * A class representing a playlist search result.
 */
export class YouTubeSearchResultPlaylist {
  /**
   * YouTube  playlist id
   */
  id: string;
  /**
   * Playlist title.
   */
  name: string;
  /**
   * Playlist URL.
   */
  url: string;
  /**
   * Playlist owner
   */
  uploader: {
    name?: string;
    url?: string;
  };
  /**
   * Number of videos in the playlist, 0 when YouTube does not show it
   */
  length: number;
  constructor(info: PlaylistSummary) {
    this.id = info.id;
    this.name = info.title;
    this.url = info.url;
    this.uploader = { name: info.author.name, url: info.author.url };
    this.length = info.videoCount ?? 0;
  }
}
