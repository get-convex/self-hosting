# Changelog

## 0.1.1-alpha.0

- Add optional convex-fs CDN mode for static asset serving (`--cdn` flag)
- Non-HTML assets can be served from CDN edge network via convex-fs
- New `cdnBaseUrl` option on `registerStaticRoutes`
- Schema: `storageId` now optional, new `blobId` field for CDN assets
- `gcOldAssets` returns `{ deleted, blobIds }` (breaking change from number return)

## 0.1.2-alpha.1

removed cloudflare for now.

## 0.1.1

- Setup wizard now configures custom domains for Cloudflare Workers
- Added note about running `convex dev` for HTTP actions error
- Added documentation for non-Vite bundlers (Expo, Next.js)

## 0.1.0

- Migrated from Cloudflare Pages to Workers Static Assets

## 0.0.0

- Initial release.
