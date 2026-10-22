import { API } from "./API";
import { DisTubeError, InfoExtractorPlugin, Playlist, type ResolveOptions, Song, checkInvalidKey } from "distube";

export type SpotifyPluginOptions = {
  api?: {
    clientId?: string;
    clientSecret?: string;
    topTracksCountry?: string;
  };
};

export class SpotifyPlugin extends InfoExtractorPlugin {
  api: API;
  constructor(options: SpotifyPluginOptions = {}) {
    super();
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new DisTubeError("INVALID_TYPE", ["object", "undefined"], options, "SpotifyPluginOptions");
    }
    checkInvalidKey(options, ["api"], "SpotifyPluginOptions");
    if (options.api !== undefined && (typeof options.api !== "object" || Array.isArray(options.api))) {
      throw new DisTubeError("INVALID_TYPE", ["object", "undefined"], options.api, "api");
    } else if (options.api) {
      if (options.api.clientId && typeof options.api.clientId !== "string") {
        throw new DisTubeError("INVALID_TYPE", "string", options.api.clientId, "SpotifyPluginOptions.api.clientId");
      }
      if (options.api.clientSecret && typeof options.api.clientSecret !== "string") {
        throw new DisTubeError(
          "INVALID_TYPE",
          "string",
          options.api.clientSecret,
          "SpotifyPluginOptions.api.clientSecret",
        );
      }
      if (options.api.topTracksCountry && typeof options.api.topTracksCountry !== "string") {
        throw new DisTubeError(
          "INVALID_TYPE",
          "string",
          options.api.topTracksCountry,
          "SpotifyPluginOptions.api.topTracksCountry",
        );
      }
    }
    this.api = new API(options.api?.clientId, options.api?.clientSecret, options.api?.topTracksCountry);
  }

  validate(url: string) {
    if (typeof url !== "string" || !url.includes("spotify")) return false;
    try {
      const parsedURL = this.api.parseUrl(url);
      if (!parsedURL.type || !this.api.isSupportedTypes(parsedURL.type)) return false;
      return true;
    } catch {
      return false;
    }
  }

  async resolve<T>(url: string, options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
    const data = await this.api.getData(url);
    if (data.type === "track") {
      return new Song(
        {
          plugin: this,
          source: "spotify",
          playFromSource: false,
          name: data.name,
          id: data.id,
          url: `https://open.spotify.com/track/${data.id}`,
          thumbnail: data.thumbnail,
          uploader: {
            name: data.artists.map(a => a.name).join(", "),
          },
          duration: data.duration / 1000,
        },
        options,
      );
    }
    return new Playlist(
      {
        source: "spotify",
        name: data.name,
        url: data.url,
        thumbnail: data.thumbnail,
        songs: data.tracks.map(
          t =>
            new Song(
              {
                plugin: this,
                source: "spotify",
                id: t.id,
                playFromSource: false,
                name: t.name,
                thumbnail: t.thumbnail,
                uploader: {
                  name: t.artists.map(a => a.name).join(", "),
                },
                url: `https://open.spotify.com/track/${t.id}`,
                duration: t.duration / 1000,
              },
              options,
            ),
        ),
      },
      options,
    );
  }

  createSearchQuery<T>(song: Song<T>): string {
    return `${song.name} ${song.uploader.name}`;
  }

  getRelatedSongs() {
    return [];
  }
}

export default SpotifyPlugin;
