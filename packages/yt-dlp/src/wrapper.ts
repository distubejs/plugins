import dargs from "dargs";
import fs from "node:fs/promises";
import { type SpawnOptionsWithoutStdio, spawn } from "node:child_process";
import { type Dispatcher, request } from "undici";
import { YTDLP_DIR, YTDLP_IS_WINDOWS, YTDLP_PATH, YTDLP_URL } from "./env";
import type { YtDlpFlags, YtDlpResponse } from "./type";

const makeRequest = async (url: string): Promise<Dispatcher.ResponseData> => {
  const response = await request(url, { headers: { "user-agent": "distube" } });
  if (!response.statusCode) throw new Error(`Cannot make requests to '${url}'`);
  if (response.statusCode.toString().startsWith("3")) {
    if (!response.headers.location || Array.isArray(response.headers.location)) {
      throw new Error(`Cannot redirect to '${url}'`);
    }
    for await (const _chunk of response.body) {
      // force consumption of body
    }
    return makeRequest(response.headers.location);
  }
  if (response.statusCode.toString().startsWith("2")) return response;
  throw new Error(`${url}\nStatus code ${response.statusCode.toString()}`);
};

const args = (url: string, flags = {}) => [url].concat(dargs(flags, { useEquals: false })).filter(Boolean);

export const json = (url: string, flags?: YtDlpFlags, options?: SpawnOptionsWithoutStdio): Promise<YtDlpResponse> => {
  const process = spawn(YTDLP_PATH, args(url, flags), options);
  return new Promise((resolve, reject) => {
    let output = "";
    process.stdout?.on("data", chunk => {
      output += chunk;
    });
    process.stderr?.on("data", chunk => {
      output += chunk;
    });
    process.on("close", code => {
      if (code === 0) resolve(JSON.parse(output));
      else reject(new Error(output));
    });
    process.on("error", reject);
  });
};

const binContentTypes = ["binary/octet-stream", "application/octet-stream", "application/x-binary"];
const getBinary = async (url?: string) => {
  let version = "N/A";
  if (!url) {
    const defaultFilename = `yt-dlp${YTDLP_IS_WINDOWS ? ".exe" : ""}`;
    const defaultUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${defaultFilename}`;
    try {
      const response = await makeRequest("https://api.github.com/repos/yt-dlp/yt-dlp/releases?per_page=1");
      const [{ assets, tag_name }] = <any>await response.body.json();
      const { browser_download_url } = assets.find(
        ({ name }: { name: string }) => name === `yt-dlp${YTDLP_IS_WINDOWS ? ".exe" : ""}`,
      );
      version = typeof tag_name === "string" ? tag_name : "latest";
      url = typeof browser_download_url === "string" ? browser_download_url : defaultUrl;
    } catch {
      version = "latest";
      url = defaultUrl;
    }
  }

  const response = await makeRequest(url);
  const contentType = response.headers["content-type"]?.toString();

  if (binContentTypes.includes(contentType ?? "")) return { buffer: await response.body.arrayBuffer(), version };

  throw new Error(`Unsupported content type: ${contentType}`);
};

export const download = () =>
  Promise.all([getBinary(YTDLP_URL), fs.mkdir(YTDLP_DIR, { recursive: true }).catch(() => undefined)]).then(
    ([{ buffer, version }]) => {
      fs.writeFile(YTDLP_PATH, Buffer.from(buffer), { mode: 493 });
      return version;
    },
  );
