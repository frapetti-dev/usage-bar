# usage-bar

omp extension: below-editor widget showing subscription usage (remaining bars + reset countdown) for the session's active models.

## Install

```sh
echo "@frapetti-dev:registry=https://npm.pkg.github.com" >> ~/.npmrc
npm install @frapetti-dev/usage-bar
```

## Development

`bun install`, `bun run typecheck`, `bun test`.

## Release

Bump `version` in `package.json`, commit, then `git tag vX.Y.Z && git push --tags`. The Publish workflow verifies, publishes to GitHub Packages and creates the GitHub Release.

## License

MIT
