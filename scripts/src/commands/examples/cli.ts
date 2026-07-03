import { findWorkspaceRoot, LivestoreWorkspace } from '@livestore/utils-dev/node'
import { Effect, Layer, Logger, LogLevel } from '@livestore/utils/effect'
import { Cli, PlatformNode } from '@livestore/utils/node'

import { copyTodomvcSrc } from './copy-examples.ts'
import { buildExampleWorkers, command as deployExamplesCommand } from './deploy-examples.ts'
import { validateLinksCommand } from './validate-links.ts'

const workspaceRoot = findWorkspaceRoot(import.meta.dirname)

const examplesBuildWorkersCommand = Cli.Command.make(
  'build-workers',
  {
    exampleFilter: Cli.Options.text('example-filter').pipe(Cli.Options.withAlias('e'), Cli.Options.optional),
    prod: Cli.Options.boolean('prod').pipe(Cli.Options.withDefault(false)),
  },
  Effect.fn(function* ({ exampleFilter, prod }) {
    yield* buildExampleWorkers({ exampleFilter, prod })
  }),
)

export const examplesCommand = Cli.Command.make('examples').pipe(
  Cli.Command.withSubcommands([
    examplesBuildWorkersCommand,
    deployExamplesCommand,
    copyTodomvcSrc,
    validateLinksCommand,
  ]),
)

if (import.meta.main === true) {
  const cli = Cli.Command.run(examplesCommand, {
    name: 'examples',
    version: '0.0.0',
  })

  cli(process.argv).pipe(
    Effect.provide(Layer.mergeAll(PlatformNode.NodeContext.layer, LivestoreWorkspace.fromPath(workspaceRoot))),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    PlatformNode.NodeRuntime.runMain,
  )
}
