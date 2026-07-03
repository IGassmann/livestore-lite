import { LivestoreWorkspace, OtelLiveHttp } from '@livestore/utils-dev/node'
import { Effect, FetchHttpClient, Layer, Logger, LogLevel } from '@livestore/utils/effect'
import { Cli, PlatformNode } from '@livestore/utils/node'

import { debugCommand } from './commands/debug.ts'
import { docsCommand } from './commands/docs.ts'
import { examplesCommand } from './commands/examples/cli.ts'
import { githubCommand } from './commands/github.ts'
import { lintCommand } from './commands/lint.ts'
import { releaseCommand } from './commands/release.ts'
import { testCommand } from './commands/test-commands.ts'
import { updateDepsCommand } from './commands/update-deps.ts'

const command = Cli.Command.make('repo').pipe(
  Cli.Command.withSubcommands([
    examplesCommand,
    lintCommand,
    githubCommand,
    testCommand,
    docsCommand,
    releaseCommand,
    updateDepsCommand,
    debugCommand,
  ]),
)

if (import.meta.main) {
  // CLI for managing the LiveStore repository.
  const cli = Cli.Command.run(command, {
    name: 'repo',
    version: '0.0.0',
  })

  const layer = Layer.mergeAll(
    PlatformNode.NodeContext.layer,
    FetchHttpClient.layer,
    OtelLiveHttp({
      serviceName: 'repo-cli',
      rootSpanName: 'cli',
      rootSpanAttributes: { 'span.label': process.argv.slice(2).join(' ') },
      skipLogUrl: process.argv.join(' ').includes('--completions'),
      traceNodeBootstrap: true,
    }),
    LivestoreWorkspace.live,
  )

  cli(process.argv).pipe(
    Effect.provide(layer),
    Effect.annotateLogs({ thread: 'repo-cli' }),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.scoped,
    PlatformNode.NodeRuntime.runMain,
  )
}
