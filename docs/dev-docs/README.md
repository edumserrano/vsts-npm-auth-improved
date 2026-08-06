# Developer documentation

The repository contains two independently built and published npm packages:

- [`vsts-npm-auth-improved`](../../projects/vsts-npm-auth-improved/README.md)
- [`create-vsts-npm-auth-improved`](../../projects/create-vsts-npm-auth-improved/README.md)

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later
- Windows for automatic npm registry authentication

Use these documents when maintaining the repository:

- [development, testing, and package inspection](development.md)
- [the release process, including automatic releases for Dependabot updates](releases.md)
- [testing strategies](#testing-strategies)
- [architecture decisions](#architecture-decisions)

## Testing strategies

- [`vsts-npm-auth-improved`](../../projects/vsts-npm-auth-improved/tests/README.md)
- [`create-vsts-npm-auth-improved`](../../projects/create-vsts-npm-auth-improved/tests/README.md)

## Architecture decisions

- [ADR 0001: Use a GitHub App for release preparation](adr/0001-use-a-github-app-for-release-preparation.md)
