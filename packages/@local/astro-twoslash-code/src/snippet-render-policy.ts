import crypto from 'node:crypto'

const hashString = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const SNIPPET_RENDER_POLICY_SIGNATURE = 'entry-twoslash-support-syntax@1'

export const createSnippetManifestConfigHash = (rendererConfigHash: string): string =>
  hashString(JSON.stringify({ rendererConfigHash, snippetRenderPolicy: SNIPPET_RENDER_POLICY_SIGNATURE }))
