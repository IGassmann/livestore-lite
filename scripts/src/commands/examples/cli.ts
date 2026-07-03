import { Effect } from '@livestore/utils/effect'
import { Cli } from '@livestore/utils/node'

import { copyTodomvcSrc } from './copy-examples.ts'
import { buildExampleWorkers, command as deployExamplesCommand } from './deploy-examples.ts'
import { validateLinksCommand } from './validate-links.ts'

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
