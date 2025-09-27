# Deno Permission Broker

A graphical permission broker for Deno applications that provides a user-friendly interface for managing runtime permissions.

## Overview

The Deno Permission Broker is a GUI application built with Slint UI that acts as an intermediary for Deno permission requests. Instead of using command-line flags or prompts, applications can request permissions through this broker, which presents them in a gui interface.

## Installation & Usage

### Running the Broker

```bash
deno run --allow-all --unstable-raw-imports https://raw.githubusercontent.com/sigmaSd/dpb/refs/heads/master/main.ts [socket-path]
```

Default socket path: `/tmp/deno_perm_broker.sock`

### Using with Deno Applications

Applications can connect to the broker via the Unix socket to request permissions. The broker will display a dialog for each request, allowing users to:

- **Allow**: Grant the specific permission
- **Deny**: Reject the permission request
- **Allow All**: Automatically approve all future requests of this permission type

## Interface

<img width="1280" height="685" alt="image" src="https://github.com/user-attachments/assets/34c7bddb-58bc-427b-9470-328fb75971e5" />
<img width="1280" height="685" alt="image" src="https://github.com/user-attachments/assets/caeb5357-1b57-40a1-8f88-ba8b7aeb4d14" />

## Architecture

The broker consists of two main components:

1. **Permission Broker (TypeScript)**: Handles Unix socket communication, permission logic, and UI state management
2. **User Interface (Slint)**: Modern GUI for displaying requests and managing permissions

## JSON Protocol

The broker communicates using a simple JSON protocol:

**Request Format:**
```json
{
  "v": 1,
  "id": 123,
  "datetime": "2024-01-01T12:00:00Z",
  "permission": "read",
  "value": "/path/to/file"
}
```

**Response Format:**
```json
{
  "id": 123,
  "result": "allow" | "deny"
}
```

## License

MIT License
