<div align="center">
  <p>
    <a href="https://nodei.co/npm/@distube/file"><img src="https://nodei.co/npm/@distube/file.png?downloads=true&downloadRank=true&stars=true"></a>
  </p>
  <p>
    <img alt="npm peer dependency version" src="https://img.shields.io/npm/dependency-version/@distube/file/peer/distube?style=flat-square">
    <img alt="npm" src="https://img.shields.io/npm/dt/@distube/file?logo=npm&style=flat-square">
    <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/distubejs/plugins?logo=github&logoColor=white&style=flat-square">
    <a href="https://discord.gg/feaDd9h"><img alt="Discord" src="https://img.shields.io/discord/732254550689316914?logo=discord&logoColor=white&style=flat-square"></a>
  </p>
  <p>
    <a href='https://ko-fi.com/skick' target='_blank'><img height='48' src='https://storage.ko-fi.com/cdn/kofi3.png' alt='Buy Me a Coffee at ko-fi.com' /></a>
  </p>
</div>

# @distube/file

A DisTube playable extractor plugin for supporting local files.

[_What is a playable extractor plugin?_](https://github.com/skick1234/DisTube/wiki/Projects-Hub#plugins)

## Installation

```sh
npm install @distube/file@latest
```

## Usage

```ts
import { DisTube } from "distube";
import { FilePlugin } from "@distube/file";

const distube = new DisTube(client, {
  plugins: [new FilePlugin()],
});

distube.play(vc, "file://path/to/file.mp3");
distube.play(vc, "file:///../relative/path/to/file.mp3");
```
