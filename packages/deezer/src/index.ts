import { getAlbum, getPlaylist, getTrack } from "./API";
import { DisTubeError, InfoExtractorPlugin, Playlist, Song } from "distube";
import type { ResolveOptions } from "distube";

const SUPPORTED_TYPES = ["album", "playlist", "track"];

const REGEX = /^https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)\/?(?:\?.*?)?$/;

const parseURL = (url: string): { type?: string; id?: string } => {
  const [, type, id] = url.match(REGEX) ?? [];
  return { type, id };
};

export class DeezerPlugin extends InfoExtractorPlugin {
  validate(url: string) {
    if (typeof url !== "string" || !url.includes("deezer")) return false;
    const { type, id } = parseURL(url);
    if (!type || !id || !SUPPORTED_TYPES.includes(type)) return false;
    return true;
  }

  async resolve<T>(url: string, options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
    const { type, id } = parseURL(url);
    if (!type || !id) throw new DisTubeError("DEEZER_PLUGIN_INVALID_URL", `Invalid Deezer url: ${url}`);
    const api = type === "track" ? getTrack(id) : type === "album" ? getAlbum(id) : getPlaylist(id);
    const data = await api.catch(e => {
      throw new DisTubeError("DEEZER_PLUGIN_API_ERROR", e.message);
    });
    if (!data.type || !SUPPORTED_TYPES.includes(data.type)) {
      throw new DisTubeError("DEEZER_PLUGIN_NOT_SUPPORTED", "This deezer link is not supported.");
    }
    if (data.type === "track") {
      return new Song(
        {
          plugin: this,
          source: "deezer",
          playFromSource: false,
          id: data.id.toString(),
          url: data.link,
          name: data.title,
          uploader: {
            name: data.artist.name,
            url: data.artist.link,
          },
          thumbnail: data.album.cover_xl || data.album.cover_big || data.album.cover_medium || data.album.cover,
        },
        options,
      );
    }
    return new Playlist(
      {
        source: "deezer",
        url: data.link,
        name: data.title,
        id: data.id.toString(),
        thumbnail:
          data.type == "album"
            ? data.cover_xl || data.cover_big || data.cover_medium || data.cover
            : data.picture_xl || data.picture_big || data.picture_medium || data.picture,
        songs: data.tracks.data.map(
          song =>
            new Song(
              {
                plugin: this,
                source: "deezer",
                playFromSource: false,
                id: song.id.toString(),
                url: song.link,
                duration: song.duration,
                name: song.title,
                uploader: {
                  name: song.artist.name,
                },
                thumbnail: song.album.cover_xl || song.album.cover_big || song.album.cover_medium || song.album.cover,
              },
              options,
            ),
        ),
      },
      options,
    );
  }

  createSearchQuery<T>(song: Song<T>) {
    return `${song.name} ${song.uploader.name}`;
  }

  getRelatedSongs() {
    return [];
  }
}

export default DeezerPlugin;
