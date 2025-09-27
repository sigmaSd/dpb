#!/usr/bin/env deno run --allow-read --allow-write --allow-net --allow-env

// Test script to demonstrate various permission requests
// This will trigger the permission broker when run with DENO_PERMISSION_BROKER_PATH set

console.log("Starting Deno Permission Test App");
console.log("This app will trigger various permission requests...\n");

function testFileRead() {
  console.log("1. Testing file read permission...");
  try {
    console.log("✅ File read successful");
  } catch (error) {
    console.log("❌ File read failed:", error);
  }
}

async function testFileWrite() {
  console.log("2. Testing file write permission...");
  try {
    await Deno.writeTextFile("./test_output.txt", "Hello from test app!\n");
    console.log("✅ File write successful");
  } catch (error) {
    console.log("❌ File write failed:", error);
  }
}

async function testNetworkAccess() {
  console.log("3. Testing network access permission...");
  try {
    const response = await fetch("https://httpbin.org/get");
    console.log("✅ Network access successful, status:", response.status);
  } catch (error) {
    console.log("❌ Network access failed:", error);
  }
}

function testEnvironmentAccess() {
  console.log("4. Testing environment variable access...");
  try {
    const home = Deno.env.get("HOME");
    console.log(
      "✅ Environment access successful, HOME:",
      home ? "found" : "not found",
    );
  } catch (error) {
    console.log("❌ Environment access failed:", error);
  }
}

async function testSubprocess() {
  console.log("5. Testing subprocess execution permission...");
  try {
    const command = new Deno.Command("echo", {
      args: ["Hello from subprocess!"],
    });
    const { code, stdout } = await command.output();
    if (code === 0) {
      const output = new TextDecoder().decode(stdout);
      console.log("✅ Subprocess execution successful:", output.trim());
    }
  } catch (error) {
    console.log("❌ Subprocess execution failed:", error);
  }
}

// Run all tests
async function runAllTests() {
  console.log("Running permission tests...\n");

  await testFileRead();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testFileWrite();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testNetworkAccess();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testEnvironmentAccess();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testSubprocess();

  console.log("\n✨ All tests completed!");
}

if (import.meta.main) {
  await runAllTests();
}
