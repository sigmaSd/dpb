import * as slint from "npm:slint-ui@1.13.0";
import slintUi from "./ui.slint" with { type: "text" };

interface PermissionRequest {
  v: number;
  id: number;
  datetime: string;
  permission: string;
  value: string | null;
}

interface PermissionResponse {
  id: number;
  result: "allow" | "deny";
}

interface PermissionRequestData {
  id: number;
  permission_type: string;
  resource: string;
  timestamp: string;
  status: string;
}

interface BrokerWindow {
  broker_status: string;
  socket_path: string;
  current_time: string;
  total_requests: number;
  allowed_requests: number;
  denied_requests: number;
  recent_requests: PermissionRequestData[];
  allow_all_permissions: string[];
  permission_type: string;
  permission_value: string;
  datetime: string;
  request_id: number;
  showing_request: boolean;
  allow_clicked: () => void;
  deny_clicked: () => void;
  allow_all_clicked: () => void;
  clear_allow_all_clicked: () => void;
  run: () => Promise<void>;
}

class PermissionBroker {
  private server: Deno.Listener;
  private window: BrokerWindow;
  private pendingRequests = new Map<
    number,
    (response: PermissionResponse) => void
  >();
  private requestHistory: PermissionRequestData[] = [];
  private totalRequests = 0;
  private allowedRequests = 0;
  private deniedRequests = 0;
  private allowAllPermissions = new Set<string>();

  constructor(socketPath: string) {
    // Remove existing socket file if it exists
    try {
      Deno.removeSync(socketPath);
    } catch {
      // Ignore error if file doesn't exist
    }

    this.server = Deno.listen({ path: socketPath, transport: "unix" });

    // Create the Slint UI
    const ui = slint.loadSource(slintUi, "main.ts");
    // deno-lint-ignore no-explicit-any
    this.window = new (ui as any).Window() as BrokerWindow;

    // Initialize dashboard
    this.window.broker_status = "Listening for connections...";
    this.window.socket_path = socketPath;
    this.window.showing_request = false;
    this.window.allow_all_permissions = [];
    this.updateStats();
    this.startTimeUpdater();

    this.setupEventHandlers();

    // Start listening for connections in the background
    this.startListening();

    console.log(`Permission broker listening on: ${socketPath}`);
  }

  private setupEventHandlers() {
    this.window.allow_clicked = () => {
      console.log("Allow button clicked");
      const requestId = this.window.request_id;
      const resolver = this.pendingRequests.get(requestId);
      if (resolver) {
        console.log(`Allowing permission request ${requestId}`);
        resolver({ id: requestId, result: "allow" });
        this.pendingRequests.delete(requestId);
        this.allowedRequests++;
        this.updateRequestHistory(requestId, "allowed");
        this.returnToDashboard();
      } else {
        console.log("No pending request found");
      }
    };

    this.window.deny_clicked = () => {
      console.log("Deny button clicked");
      const requestId = this.window.request_id;
      const resolver = this.pendingRequests.get(requestId);
      if (resolver) {
        console.log(`Denying permission request ${requestId}`);
        resolver({ id: requestId, result: "deny" });
        this.pendingRequests.delete(requestId);
        this.deniedRequests++;
        this.updateRequestHistory(requestId, "denied");
        this.returnToDashboard();
      } else {
        console.log("No pending request found");
      }
    };

    this.window.allow_all_clicked = () => {
      console.log("Allow All button clicked");
      const requestId = this.window.request_id;
      const resolver = this.pendingRequests.get(requestId);
      if (resolver) {
        const requestData = this.requestHistory.find((r) => r.id === requestId);
        if (requestData) {
          // Extract the raw permission type from the formatted display name
          const permissionType = this.getRawPermissionType(
            requestData.permission_type,
          );
          this.allowAllPermissions.add(permissionType);
          console.log(`Adding ${permissionType} to allow-all list`);
          this.updateAllowAllPermissionsUI();
        }

        console.log(
          `Allowing permission request ${requestId} and all future ${requestData?.permission_type} requests`,
        );
        resolver({ id: requestId, result: "allow" });
        this.pendingRequests.delete(requestId);
        this.allowedRequests++;
        this.updateRequestHistory(requestId, "allowed");
        this.returnToDashboard();
      } else {
        console.log("No pending request found");
      }
    };

    this.window.clear_allow_all_clicked = () => {
      console.log("Clear Allow All button clicked");
      this.allowAllPermissions.clear();
      this.updateAllowAllPermissionsUI();
      console.log("Cleared all auto-allow permissions");
    };
  }

  private startTimeUpdater() {
    setInterval(() => {
      this.window.current_time = new Date().toLocaleTimeString();
    }, 1000);
  }

  private updateStats() {
    this.window.total_requests = this.totalRequests;
    this.window.allowed_requests = this.allowedRequests;
    this.window.denied_requests = this.deniedRequests;
    this.window.recent_requests = this.requestHistory.slice(-10).reverse();
  }

  private updateAllowAllPermissionsUI() {
    this.window.allow_all_permissions = Array.from(this.allowAllPermissions)
      .map(
        (perm) => this.formatPermissionType(perm),
      );
  }

  private updateRequestHistory(requestId: number, status: string) {
    const requestIndex = this.requestHistory.findIndex((r) =>
      r.id === requestId
    );
    if (requestIndex >= 0) {
      this.requestHistory[requestIndex].status = status.toUpperCase();
    }
    this.updateStats();
  }

  private returnToDashboard() {
    this.window.showing_request = false;
    this.window.broker_status = "Listening for connections...";
  }

  private async startListening() {
    for await (const connection of this.server) {
      this.handleConnection(connection);
    }
  }

  private async handleConnection(connection: Deno.Conn) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    try {
      const buffer = new Uint8Array(4096);

      while (true) {
        const bytesRead = await connection.read(buffer);
        if (!bytesRead) break;

        const data = decoder.decode(buffer.subarray(0, bytesRead));
        const lines = data.trim().split("\n");

        for (const line of lines) {
          if (line.trim()) {
            try {
              const request: PermissionRequest = JSON.parse(line);
              console.log("Received permission request:", request);

              const response = await this.handlePermissionRequest(request);
              const responseJson = JSON.stringify(response) + "\n";

              await connection.write(encoder.encode(responseJson));
              console.log("Sent response:", response);
            } catch (error) {
              console.error("Error parsing request:", error);
              // Send deny response for invalid requests
              const errorResponse = { id: 0, result: "deny" as const };
              await connection.write(
                encoder.encode(JSON.stringify(errorResponse) + "\n"),
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      try {
        connection.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  private handlePermissionRequest(
    request: PermissionRequest,
  ): Promise<PermissionResponse> {
    return new Promise<PermissionResponse>((resolve) => {
      // Check if this permission type is in the allow-all list
      if (this.allowAllPermissions.has(request.permission)) {
        console.log(
          `Auto-allowing ${request.permission} request due to allow-all setting`,
        );

        // Add to request history as allowed
        this.totalRequests++;
        this.allowedRequests++;
        const requestData: PermissionRequestData = {
          id: request.id,
          permission_type: this.formatPermissionType(request.permission),
          resource: this.formatPermissionValue(request.value),
          timestamp: new Date().toLocaleTimeString(),
          status: "ALLOWED",
        };
        this.requestHistory.push(requestData);
        this.updateStats();

        // Immediately resolve with allow
        resolve({ id: request.id, result: "allow" });
        return;
      }

      // Store the resolver for this request
      this.pendingRequests.set(request.id, resolve);

      console.log(
        `Showing permission dialog for ${request.permission}: ${request.value}`,
      );

      // Add to request history as pending
      this.totalRequests++;
      const requestData: PermissionRequestData = {
        id: request.id,
        permission_type: this.formatPermissionType(request.permission),
        resource: this.formatPermissionValue(request.value),
        timestamp: new Date().toLocaleTimeString(),
        status: "PENDING",
      };
      this.requestHistory.push(requestData);

      // Update the window with request details and show request view
      this.window.permission_type = requestData.permission_type;
      this.window.permission_value = requestData.resource;
      this.window.datetime = this.formatDateTime(request.datetime);
      this.window.request_id = request.id;
      this.window.showing_request = true;
      this.window.broker_status = "Processing permission request...";
    });
  }

  private formatPermissionType(permission: string): string {
    switch (permission) {
      case "read":
        return "File System Read";
      case "write":
        return "File System Write";
      case "net":
        return "Network Access";
      case "env":
        return "Environment Variables";
      case "run":
        return "Run Subprocess";
      case "ffi":
        return "Foreign Function Interface";
      case "hrtime":
        return "High Resolution Time";
      case "sys":
        return "System Information";
      default:
        return permission.charAt(0).toUpperCase() + permission.slice(1);
    }
  }

  private formatPermissionValue(value: string | null): string {
    if (value === null) {
      return "All resources";
    }

    try {
      // Try to parse as JSON string
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : String(parsed);
    } catch {
      // If not JSON, return as-is
      return value;
    }
  }

  private formatDateTime(datetime: string): string {
    try {
      const date = new Date(datetime);
      return date.toLocaleString();
    } catch {
      return datetime;
    }
  }

  private getRawPermissionType(formattedType: string): string {
    switch (formattedType) {
      case "File System Read":
        return "read";
      case "File System Write":
        return "write";
      case "Network Access":
        return "net";
      case "Environment Variables":
        return "env";
      case "Run Subprocess":
        return "run";
      case "Foreign Function Interface":
        return "ffi";
      case "High Resolution Time":
        return "hrtime";
      case "System Information":
        return "sys";
      default:
        return formattedType.toLowerCase();
    }
  }

  async run() {
    // Run the Slint GUI window - this will show the window and handle events
    await this.window.run();
  }

  close() {
    this.server.close();
  }
}

// Main execution
if (import.meta.main) {
  const socketPath = Deno.args[0] || "/tmp/deno_perm_broker.sock";

  console.log(`Starting permission broker on: ${socketPath}`);
  const broker = new PermissionBroker(socketPath);

  // Handle graceful shutdown
  Deno.addSignalListener("SIGINT", () => {
    console.log("\nShutting down permission broker...");
    broker.close();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGTERM", () => {
    console.log("\nShutting down permission broker...");
    broker.close();
    Deno.exit(0);
  });

  // Keep the broker running
  await broker.run();
}
