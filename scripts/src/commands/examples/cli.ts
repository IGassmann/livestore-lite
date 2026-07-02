import fs from 'node:fs'

import { shouldNeverHappen } from '@livestore/utils'
import { cmd, LivestoreWorkspace } from '@livestore/utils-dev/node'
import { Effect, Option } from '@livestore/utils/effect'
import { Cli } from '@livestore/utils/node'

import { copyTodomvcSrc } from './copy-examples.ts'
import {
  buildExampleWorkers,
  command as deployExamplesCommand,
  ensureExampleExists,
  readExampleSlugs,
  runExampleTests,
} from './deploy-examples.ts'
import { validateLinksCommand } from './validate-links.ts'

const workspaceRoot =
  process.env.WORKSPACE_ROOT ?? shouldNeverHappen(`WORKSPACE_ROOT is not set. Run example commands through Vite+ tasks`)
const examplesDir = `${workspaceRoot}/examples`

const exampleChoices = (() => {
  /**
   * The Effect CLI collects option metadata eagerly to power shell completions. We peek at the
   * filesystem synchronously here while the actual command logic still validates everything via the
   * Effect-powered helpers to stay robust at runtime.
   */
  try {
    return fs
      .readdirSync(examplesDir)
      .filter((entry) => {
        try {
          return fs.statSync(`${examplesDir}/${entry}`).isDirectory()
        } catch {
          return false
        }
      })
      .toSorted((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
})()

const examplesTestCommand = Cli.Command.make(
  'test',
  {
    example: Cli.Options.choice('example', exampleChoices).pipe(Cli.Options.optional),
  },
  Effect.fn(function* ({ example }) {
    // Reuse the deploy helpers so local workflows and CI keep the same validation rules.
    const availableExamples = yield* readExampleSlugs()
    const targets =
      Option.isSome(example) === true
        ? [yield* ensureExampleExists(example.value, availableExamples)]
        : availableExamples

    if (targets.length === 0) {
      yield* Effect.logWarning('No examples found in the examples directory')
      return
    }

    yield* runExampleTests(targets)
  }),
)

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

const examplesRunCommand = Cli.Command.make(
  'run',
  {
    example: Cli.Args.choice(
      exampleChoices.map((example) => [example, example]),
      { name: 'example' },
    ),
  },
  Effect.fn(function* ({ example }) {
    const availableExamples = yield* readExampleSlugs()
    const selected = yield* ensureExampleExists(example, availableExamples)
    // Use the per-example package selection so dotenv / env loading behaves like the package dev script.
    yield* cmd(['vp', 'run', '--filter', `./examples/${selected}`, 'dev']).pipe(
      Effect.provide(LivestoreWorkspace.toCwd()),
    )
  }),
)

export const examplesCommand = Cli.Command.make('examples').pipe(
  Cli.Command.withSubcommands([
    examplesBuildWorkersCommand,
    deployExamplesCommand,
    copyTodomvcSrc,
    validateLinksCommand,
    examplesRunCommand,
    examplesTestCommand,
  ]),
)
