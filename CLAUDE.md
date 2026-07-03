# Project-Specific Instructions for Claude

## Setup

This repository uses Node 24 and Vite+ as the contributor-facing command surface. Run `corepack enable`, `corepack prepare pnpm@11.3.0 --activate`, and `vp install` before running repo tasks.

## Tooling

- For dependency management see ./contributor-docs/dependency-management.md

### Vite+ tasks

Use `vp run -w <task>` for common workflows:

- `vp run -w check:all` / `vp check --fix` to run or auto-fix the static checks
- `vp run -w test:unit`, `vp run -w test:integration`, or `vp run -w test:perf` to run the tests
  - Some tests can take a while to run.
- `vp run -w docs:dev` / `vp run -w docs:build:phase:astro` for common docs workflows
- `vp run -w examples:test` for example tests
- ... and more

## Testing

- When working on specific Vitest tests, use `vp test run` directly instead of broader Vite+ tasks and make sure to target the specific test file and test name: e.g. `vp test run packages/@livestore/common/src/index.test.ts --testNamePattern "should be able to get the number of users"`.

## TypeScript

- Avoid `as any`, force-casting etc as much as possible.
- When writing non-trivial code, make sure to leave some concise code comments explaining the why. (Preferably jsdoc style.)
- When refactoring code you don't need to consider backwards compatibility unless specifically asked for.
- Keep exported members at the top of the file and move unexported helpers to the bottom.
- Never add `paths` to `tsconfig.json`. Prefer using `package.json#exports` instead.

## Task Management

Use GitHub issues or an issue checklist for non-trivial work.

- Link the issue in the PR when the repo workflow expects it
- File follow-up GitHub issues for out-of-scope work discovered during implementation

## Git

- The default branch of this repository is `main`.
- Before committing, run `vp check --fix` to auto-fix most static-check errors. Make sure there are no static-check errors.

### Branch Naming Conventions

- Use descriptive branch names that clearly indicate the purpose: `my-username/feat/add-user-auth`, `my-username/fix/memory-leak`, `my-username/docs/api-reference`
- Keep branch names concise but specific (under 30 characters when possible)
- Use kebab-case for consistency

### Development Workflow

- Run the full test suite before pushing: `vp run -w test`
- Ensure static checks pass: `vp run -w check:all`
- Use `vp check --fix` to automatically fix formatting issues

### Issues

- When asked to create a GitHub issue, use the GitHub CLI to do so.
- Add appropriate labels to the issue. Only use existing labels, don't create new ones.

### Pull Requests

Describe the pull request in terms of the problem it addresses and the approach it takes—avoid titles like "update tests" that hide the intent. A good title should hint at both the underlying issue and the chosen fix, e.g. `Fix backlog replay flake by stabilizing event helper`. Frame the story around the impact to downstream data consumers or workflows rather than generic "user-facing" language.

Checklist:

- State the problem, solution, and validation steps in the PR body using the template sections.
- Mention any trade-offs or follow-up work the reviewer should know about.
- Research relevant issues and link them to the PR.
- Note which tests were run (or why none were needed).
- Keep the title and description in sync with the current scope as the work evolves—update them whenever the plan shifts.
- Keep CHANGELOG.md up to date with the changes in the PR according to `contributor-docs/changelog-guide.md`.
- Make sure to apply appropriate labels. Don't create new labels, but only reuse existing ones.
- After every substantial change (new commit, merge, or rebase), reread the PR title/body and refresh them before pushing or requesting review.
- When possible, include demo evidence (logs, screenshots, CLI commands, or quick diagrams like Mermaid/ASCII) that demonstrates the change from a data-workflow perspective so reviewers can visualize the impact faster.

### Environment Variables

- Keep sensitive environment variables in a git-ignored local env file and never commit them to the repository.

## Documentation / Examples

- It's critical that the documentation and examples are up to date and accurate. When changing code, make sure to update the documentation and examples.
- For code snippets make sure to follow ./contributor-docs/docs/snippets.md
