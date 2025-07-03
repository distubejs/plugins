import { Soundcloud } from "soundcloud.ts";
import { DisTubeError, ExtractorPlugin, Playlist, Song, checkInvalidKey } from "distube";
import type { ResolveOptions } from "distube";
import type { SoundcloudPlaylist, SoundcloudTrack } from "soundcloud.ts";

type Falsy = undefined | null | false | 0 | "";
const isTruthy = <T>(x: T | Falsy): x is T => Boolean(x);
export enum SearchType {
  Track = "track",
  Playlist = "playlist",
}

export interface SoundCloudPluginOptions {
  clientId?: string;
  oauthToken?: string;
}

export class SoundCloudPlugin extends ExtractorPlugin {
  soundcloud: Soundcloud;
  constructor(options: SoundCloudPluginOptions = {}) {
    super();
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new DisTubeError("INVALID_TYPE", ["object", "undefined"], options, "SoundCloudPluginOptions");
    }
    checkInvalidKey(options, ["clientId", "oauthToken"], "SoundCloudPluginOptions");
    if (options.clientId && typeof options.clientId !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", options.clientId, "clientId");
    }
    if (options.oauthToken && typeof options.oauthToken !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", options.oauthToken, "oauthToken");
    }

    this.soundcloud = new Soundcloud(options.clientId, options.oauthToken);
  }
  search<T>(query: string, type?: SearchType.Track, limit?: number, options?: ResolveOptions<T>): Promise<Song<T>[]>;
  search<T>(
    query: string,
    type: SearchType.Playlist,
    limit?: number,
    options?: ResolveOptions<T>,
  ): Promise<Playlist<T>[]>;
  search<T>(
    query: string,
    type?: SearchType,
    limit?: number,
    options?: ResolveOptions<T>,
  ): Promise<Song<T>[] | Playlist<T>[]>;
  async search<T>(query: string, type: SearchType = SearchType.Track, limit = 10, options: ResolveOptions<T> = {}) {
    if (typeof query !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", query, "query");
    }
    if (!Object.values(SearchType).includes(type)) {
      throw new DisTubeError("INVALID_TYPE", Object.values(SearchType), type, "type");
    }
    if (typeof limit !== "number" || limit < 1 || !Number.isInteger(limit)) {
      throw new DisTubeError("INVALID_TYPE", "natural number", limit, "limit");
    }
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new DisTubeError("INVALID_TYPE", "object", options, "ResolveOptions");
    }

    await this.soundcloud.api.getClientId().catch(() => {
      throw new DisTubeError(
        "SOUNDCLOUD_PLUGIN_NO_CLIENT_ID",
        "Cannot find SoundCloud client id automatically. Please provide a client id in the constructor.\nGuide: https://github.com/distubejs/soundcloud#documentation",
      );
    });

    switch (type) {
      case SearchType.Track: {
        const data = await this.soundcloud.tracks.search({ q: query, limit });
        if (!data?.collection?.length) {
          throw new DisTubeError("SOUNDCLOUD_PLUGIN_NO_RESULT", `Cannot find any "${query}" ${type} on SoundCloud!`);
        }
        return data.collection.map(t => new SoundCloudSong(this, t, options));
      }
      case SearchType.Playlist: {
        const data = await this.soundcloud.playlists.search({ q: query, limit });
        const playlists = data.collection;
        return (
          await Promise.all(
            playlists.map(async p => new SoundCloudPlaylist(this, await this.soundcloud.playlists.fetch(p), options)),
          )
        ).filter(isTruthy);
      }
      default:
        throw new DisTubeError("SOUNDCLOUD_PLUGIN_UNSUPPORTED_TYPE", `${type} search is not supported!`);
    }
  }

  validate(url: string) {
    return /^https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(.*)$/.test(url);
  }

  async resolve<T>(url: string, options: ResolveOptions<T>) {
    await this.soundcloud.api.getClientId().catch(() => {
      throw new DisTubeError(
        "SOUNDCLOUD_PLUGIN_NO_CLIENT_ID",
        "Cannot find SoundCloud client id automatically. Please provide a client id in the constructor.\nGuide: https://github.com/distubejs/soundcloud#documentation",
      );
    });
    const opt = { ...options, source: "soundcloud" };
    url = url.replace(/:\/\/(m|www)\./g, "://");
    const data = await this.soundcloud.resolve.get(url, true).catch(e => {
      throw new DisTubeError("SOUNDCLOUD_PLUGIN_RESOLVE_ERROR", e.message);
    });
    if (!data || !["track", "playlist"].includes(data.kind)) {
      throw new DisTubeError("SOUNDCLOUD_PLUGIN_NOT_SUPPORTED", "Only public tracks and playlists are supported.");
    }

    return data.kind === "playlist"
      ? new SoundCloudPlaylist(this, await this.soundcloud.playlists.fetch(data), opt)
      : new SoundCloudSong(this, data, opt);
  }

  async getRelatedSongs(song: SoundCloudSong<undefined>) {
    if (!song.url) {
      throw new DisTubeError("SOUNDCLOUD_PLUGIN_INVALID_SONG", "Cannot get related songs from invalid song.");
    }
    const related = await this.soundcloud.tracks.related(song.url, 10);
    return related.filter(t => t.title).map(t => new SoundCloudSong(this, t));
  }

async getStreamURL(song) {
  if (!song.url) {
    throw new import_distube.DisTubeError("SOUNDCLOUD_PLUGIN_INVALID_SONG", "Cannot get stream url from invalid song.");
  }
  
  let stream = await this.soundcloud.util.streamLink(song.url).catch(() => null);

  if (stream) return stream;

  const track = await this.soundcloud.resolve.get(song.url, true).catch(() => null);

  if (!track || !track.media || !track.media.transcodings?.length) {
    throw new import_distube.DisTubeError("SOUNDCLOUD_PLUGIN_STREAM_ERROR", "Invalid or restricted SoundCloud track.");
  }


  const progressive = track.media.transcodings.find(t => t.format.protocol === "progressive");
  const transcoding = progressive || track.media.transcodings[0];

  if (!transcoding?.url) {
    throw new import_distube.DisTubeError("SOUNDCLOUD_PLUGIN_STREAM_ERROR", "No valid stream URL found.");
  }

  const clientId = await this.soundcloud.api.getClientId().catch(() => null);
  if (!clientId) {
    throw new import_distube.DisTubeError("SOUNDCLOUD_PLUGIN_NO_CLIENT_ID", "Missing client ID");
  }

  const res = await fetch(`${transcoding.url}?client_id=${clientId}`);
  if (!res.ok) {
    throw new import_distube.DisTubeError(
      "SOUNDCLOUD_PLUGIN_RATE_LIMITED",
      `Failed to fetch stream URL. HTTP ${res.status}`
    );
  }

  const json = await res.json();
  if (!json?.url) {
    throw new import_distube.DisTubeError("SOUNDCLOUD_PLUGIN_STREAM_ERROR", "Stream URL missing in response.");
  }

  return json.url; 
}

class SoundCloudSong<T> extends Song<T> {
  constructor(plugin: SoundCloudPlugin, info: SoundcloudTrack, options: ResolveOptions<T> = {}) {
    super(
      {
        plugin,
        source: "soundcloud",
        playFromSource: true,
        id: info.id.toString(),
        name: info.title,
        url: info.permalink_url,
        thumbnail: info.artwork_url,
        duration: info.duration / 1000,
        views: info.playback_count,
        uploader: {
          name: info.user?.username,
          url: info.user?.permalink_url,
        },
        likes: info.likes_count,
        reposts: info.reposts_count,
      },
      options,
    );
  }
}

class SoundCloudPlaylist<T> extends Playlist<T> {
  constructor(plugin: SoundCloudPlugin, info: SoundcloudPlaylist, options: ResolveOptions<T> = {}) {
    super(
      {
        source: "soundcloud",
        id: info.id.toString(),
        name: info.title,
        url: info.permalink_url,
        thumbnail: info.artwork_url ?? undefined,
        songs: info.tracks.map(s => new SoundCloudSong(plugin, s, options)),
      },
      options,
    );
  }
}

export default SoundCloudPlugin;
