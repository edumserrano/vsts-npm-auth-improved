# azure-devops-npm-registry-auth

Authenticate with Azure DevOps npm registry on Windows and macOS.

This package is a TypeScript implementation of the PowerShell script `npm-registry-auth.ps1`, providing equivalent registry authentication logic for npm package usage.

## Features

- ✅ **Cross-platform support**: Works on both Windows and macOS
- ✅ **Windows**: Automatically uses `vsts-npm-auth` for seamless authentication
- ✅ **macOS**: Supports Personal Access Token (PAT) authentication
- ✅ **TypeScript**: Fully typed with TypeScript definitions
- ✅ **CLI & Programmatic API**: Use as a command-line tool or import into your Node.js application
- ✅ **Well-tested**: Comprehensive Jest unit tests

## Installation

```bash
npm install azure-devops-npm-registry-auth
```

Or install globally for CLI usage:

```bash
npm install -g azure-devops-npm-registry-auth
```

## Usage

### Command Line Interface

```bash
# Basic usage (uses default .npmrc path)
azdo-npm-auth

# Specify custom .npmrc path
azdo-npm-auth --path-to-npmrc ~/.npmrc

# Force refresh authentication (Windows only)
azdo-npm-auth --refresh

# Authenticate on macOS with PAT
azdo-npm-auth --pat "your-azure-devops-pat-token"

# Show help
azdo-npm-auth --help
```

### Programmatic API

```typescript
import { authenticate, AzureDevOpsNpmAuth } from 'azure-devops-npm-registry-auth';

// Using the helper function
async function simpleAuth() {
  const result = await authenticate({
    pathToNpmrc: './.npmrc',
    pat: 'your-pat-token', // Required on macOS
    refresh: false
  });

  if (result.success) {
    console.log('Authentication successful!');
  } else {
    console.error('Authentication failed:', result.message);
  }
}

// Using the class directly
async function classBasedAuth() {
  const auth = new AzureDevOpsNpmAuth({
    pathToNpmrc: './.npmrc',
    pat: process.env.AZURE_DEVOPS_PAT
  });

  const result = await auth.authenticate();
  return result;
}
```

## Platform-Specific Behavior

### Windows

On Windows, the package automatically:
1. Checks if `vsts-npm-auth` is installed globally
2. Installs it if not present
3. Runs `vsts-npm-auth` to generate authentication tokens
4. Stores tokens in the npm configuration file (typically `%USERPROFILE%/.npmrc`)

The `--refresh` flag can be used to force a refresh of the authentication token.

### macOS

On macOS, the package requires a Personal Access Token (PAT):
1. Reads the registry URL from your `.npmrc` file
2. Base64-encodes the provided PAT
3. Sets npm credentials using `npm set` commands

**Important**: You must provide a PAT on macOS as `vsts-npm-auth` doesn't work on this platform.

#### Creating a Personal Access Token

1. Go to your Azure DevOps organization
2. Navigate to User Settings → Personal Access Tokens
3. Create a new token with **Packaging (Read)** permissions
4. Copy the token and use it with the `--pat` option

## Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--path-to-npmrc` | `-p` | Path to the .npmrc file | `./.npmrc` |
| `--pat` | `-t` | Personal Access Token (required on macOS) | - |
| `--refresh` | `-r` | Force refresh of authentication token (Windows only) | `false` |
| `--help` | `-h` | Show help message | - |

## API Reference

### `authenticate(options?: AuthOptions): Promise<AuthResult>`

Convenience function to authenticate with Azure DevOps npm registry.

#### Parameters

- `options` (optional): Authentication options
  - `pathToNpmrc?: string` - Path to .npmrc file (default: `./.npmrc`)
  - `pat?: string` - Personal Access Token for macOS
  - `refresh?: boolean` - Force refresh on Windows (default: `false`)

#### Returns

- `Promise<AuthResult>` - Result object with:
  - `success: boolean` - Whether authentication succeeded
  - `message: string` - Success or error message

### `class AzureDevOpsNpmAuth`

Main authentication class.

#### Constructor

```typescript
new AzureDevOpsNpmAuth(options?: AuthOptions)
```

#### Methods

- `authenticate(): Promise<AuthResult>` - Performs authentication

## Development

### Building

```bash
npm run build
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Project Structure

```
azure-devops-npm-registry-auth/
├── src/
│   ├── auth.ts         # Main authentication logic
│   ├── auth.spec.ts    # Unit tests
│   ├── cli.ts          # CLI interface
│   ├── types.ts        # TypeScript type definitions
│   └── public-api.ts   # Public API exports
├── dist/               # Compiled JavaScript (generated)
├── jest.config.js      # Jest configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Package configuration
```

## Migration from PowerShell Script

This package is designed to replace the PowerShell script `npm-registry-auth.ps1`. The logic has been faithfully migrated to TypeScript with the following improvements:

- Cross-platform Node.js compatibility
- Programmatic API for integration
- Comprehensive test coverage
- Better error handling
- TypeScript type safety

## Requirements

- Node.js 14 or higher
- npm 6 or higher
- On Windows: PowerShell (for `vsts-npm-auth`)
- On macOS: Azure DevOps Personal Access Token

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
