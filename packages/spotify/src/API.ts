import SpotifyInfo from "spotify-url-info";
import SpotifyWebApi from "spotify-web-api-node";
import { fetch } from "undici";
import { DisTubeError, isTruthy } from "distube";
import { parse as parseSpotifyUri } from "spotify-uri";

const SUPPORTED_TYPES = ["album", "playlist", "track", "artist"] as const;

const WEB_API = new SpotifyWebApi();
const INFO = SpotifyInfo(fetch);

type Track = {
  type: "track";
  id: string;
  name: string;
  artists: { name: string }[];
  thumbnail?: string;
  duration: number;
};

type EmbedList = {
  type: "album" | "playlist" | "artist";
  title: string;
  subtitle: string;
  uri: string;
  trackList: { title: string; subtitle: string; uri: string; duration: number }[];
  coverArt?: {
    sources?: { url: string }[];
  };
};

type DataList = {
  type: string;
  name: string;
  thumbnail?: string;
  url: string;
  tracks: Track[];
};

type Album = DataList & { type: "album" };
type Playlist = DataList & { type: "playlist" };
type Artist = DataList & { type: "artist" };
type TrackList = Album | Playlist | Artist;
type Data = Track | TrackList;

let firstWarning1 = true;
let firstWarning2 = true;

export const apiError = (e: any) =>
  new DisTubeError(
    "SPOTIFY_API_ERROR",
    `The URL is private or unavailable.${e?.body?.error?.message ? `\nDetails: ${e.body.error.message}` : ""}${
      e?.statusCode ? `\nStatus code: ${e.statusCode}.` : ""
    }`,
  );

type APITrackInfo = SpotifyApi.TrackObjectSimplified & { album: SpotifyApi.AlbumObjectSimplified };
class APITrack implements Track {
  type: "track";
  id: string;
  name: string;
  artists: { name: string }[];
  thumbnail?: string;
  duration: number;
  constructor(info: APITrackInfo) {
    this.type = "track";
    this.id = info.id;
    this.name = info.name;
    this.artists = info.artists;
    this.thumbnail = info.album?.images?.[0]?.url;
    this.duration = info.duration_ms;
  }
}

const mergeAlbumTrack = (
  album: SpotifyApi.AlbumObjectSimplified,
  track: SpotifyApi.TrackObjectSimplified,
): APITrackInfo => {
  (<APITrackInfo>track).album = album;
  return <APITrackInfo>track;
};

export class API {
  private _hasCredentials = false;
  private _expirationTime = 0;
  private _tokenAvailable = false;
  topTracksCountry = "US";

  constructor(clientId?: string, clientSecret?: string, topTracksCountry?: string) {
    if (clientId && clientSecret) {
      this._hasCredentials = true;
      WEB_API.setClientId(clientId);
      WEB_API.setClientSecret(clientSecret);
    }
    if (topTracksCountry) {
      if (!/^[A-Z]{2}$/.test(topTracksCountry)) throw new Error("Invalid region code");
      this.topTracksCountry = topTracksCountry;
    }
  }

  isSupportedTypes(type: string): type is (typeof SUPPORTED_TYPES)[number] {
    return SUPPORTED_TYPES.includes(<any>type);
  }

  async refreshToken() {
    if (Date.now() < this._expirationTime) return;
    if (this._hasCredentials) {
      try {
        const { body } = await WEB_API.clientCredentialsGrant();
        WEB_API.setAccessToken(body.access_token);
        this._expirationTime = Date.now() + body.expires_in * 1000 - 5_000;
      } catch (e) {
        if (firstWarning1) {
          firstWarning1 = false;
          this._hasCredentials = false;
          console.warn(e);
          console.warn("[SPOTIFY_PLUGIN_API] Cannot get token from your credentials. Try scraping token instead.");
        }
      }
    }
    if (!this._hasCredentials) {
      const response = await fetch("https://open.spotify.com/");
      const body = await response.text();
      const token = body.match(/"accessToken":"(.+?)"/)?.[1];
      if (!token) {
        this._tokenAvailable = false;
        if (firstWarning2) {
          firstWarning2 = false;
          console.warn(
            "[SPOTIFY_PLUGIN_API] Cannot get token from scraping. " +
              "Cannot fetch more than 100 tracks from a playlist or album.",
          );
        }
        return;
      }
      WEB_API.setAccessToken(token);
      const expiration = body.match(/"accessTokenExpirationTimestampMs":(\d+)/)?.[1];
      if (expiration) this._expirationTime = Number(expiration) - 5_000;
      // Else: token should be valid right now, but don't know when it expires
    }
    this._tokenAvailable = true;
  }

  parseUrl(url: string) {
    return parseSpotifyUri(url);
  }

  getData(url: `${string}/track/${string}`): Promise<Track>;
  getData(url: `${string}/album/${string}`): Promise<Album>;
  getData(url: `${string}/playlist/${string}`): Promise<Playlist>;
  getData(url: `${string}/artist/${string}`): Promise<Artist>;
  getData(url: string): Promise<Data>;
  async getData(url: string): Promise<Data> {
    const { type, id } = this.parseUrl(url);

    if (!id) throw new DisTubeError("SPOTIFY_API_INVALID_URL", "Invalid URL");
    if (!this.isSupportedTypes(type)) throw new DisTubeError("SPOTIFY_API_UNSUPPORTED_TYPE", "Unsupported URL type");

    await this.refreshToken();
    if (type === "track") {
      if (!this._tokenAvailable) {
        return INFO.getData(url);
      }
      try {
        const { body } = await WEB_API.getTrack(id);
        return new APITrack(body);
      } catch (e) {
        throw apiError(e);
      }
    }
    if (!this._tokenAvailable) {
      const data = (await INFO.getData(url)) as EmbedList;
      const thumbnail = data.coverArt?.sources?.[0]?.url;
      return {
        type,
        name: data.title,
        thumbnail,
        url,
        tracks: data.trackList.map(i => ({
          type: "track",
          id: this.parseUrl(i.uri).id,
          name: i.title,
          artists: [{ name: i.subtitle }],
          duration: i.duration,
          thumbnail,
        })),
      };
    }
    try {
      const { body } =
        await WEB_API[type === "album" ? "getAlbum" : type === "playlist" ? "getPlaylist" : "getArtist"](id);
      return {
        type,
        name: body.name,
        thumbnail: body.images?.[0]?.url,
        url: body.external_urls?.spotify,
        tracks: (await this.#getTracks(body)).filter(t => t?.type === "track").map(t => new APITrack(t)),
      };
    } catch (e) {
      throw apiError(e);
    }
  }

  async #getTracks(
    data: SpotifyApi.SingleAlbumResponse | SpotifyApi.SinglePlaylistResponse | SpotifyApi.SingleArtistResponse,
  ): Promise<APITrackInfo[]> {
    switch (data.type) {
      case "artist": {
        return (await WEB_API.getArtistTopTracks(data.id, this.topTracksCountry)).body.tracks;
      }
      case "album": {
        const tracks = await this.#getPaginatedItems(data);
        return tracks.map(t => mergeAlbumTrack(data, t));
      }
      case "playlist": {
        return (await this.#getPaginatedItems(data)).map(i => i.track).filter(isTruthy);
      }
    }
  }

  #getPaginatedItems(data: SpotifyApi.SingleAlbumResponse): Promise<SpotifyApi.TrackObjectSimplified[]>;
  #getPaginatedItems(data: SpotifyApi.SinglePlaylistResponse): Promise<SpotifyApi.PlaylistTrackObject[]>;
  async #getPaginatedItems(data: SpotifyApi.SingleAlbumResponse | SpotifyApi.SinglePlaylistResponse) {
    const items: (SpotifyApi.TrackObjectSimplified | SpotifyApi.PlaylistTrackObject)[] = data.tracks.items;
    const isPlaylist = data.type === "playlist";
    const limit = isPlaylist ? 100 : 50;
    const method = isPlaylist ? "getPlaylistTracks" : "getAlbumTracks";
    while (data.tracks.next) {
      await this.refreshToken();
      data.tracks = (await WEB_API[method](data.id, { offset: data.tracks.offset + data.tracks.limit, limit })).body;
      items.push(...data.tracks.items);
    }
    return items;
  }
}
