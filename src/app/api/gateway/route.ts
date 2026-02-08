import { NextRequest, NextResponse } from "next/server";
import WebSocket from "ws";

const GATEWAY_URL = process.env.GATEWAY_WS_URL || "ws://127.0.0.1:18789";
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || "";

// Simple RPC call to gateway
async function gatewayRequest(method: string, params: unknown = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_URL, { headers: { origin: "http://localhost:3000" } });
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Gateway timeout"));
    }, 10000);

    let connected = false;

    ws.on("open", () => {
      // Send connect frame
      const connectFrame = {
        type: "req",
        id: "connect-1",
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "openclaw-control-ui",  // Must be a valid client ID
            version: "1.0.0",
            platform: "linux",
            mode: "backend",
          },
          role: "operator",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          caps: [],
          auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
        },
      };
      ws.send(JSON.stringify(connectFrame));
    });

    ws.on("message", (data) => {
      try {
        const frame = JSON.parse(data.toString());

        if (frame.type === "res" && frame.id === "connect-1") {
          if (frame.ok) {
            connected = true;
            // Now send the actual request
            const reqFrame = {
              type: "req",
              id: "req-1",
              method,
              params,
            };
            ws.send(JSON.stringify(reqFrame));
          } else {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(frame.error?.message || "Connect failed"));
          }
        } else if (frame.type === "res" && frame.id === "req-1") {
          clearTimeout(timeout);
          ws.close();
          if (frame.ok) {
            resolve(frame.payload);
          } else {
            reject(new Error(frame.error?.message || "Request failed"));
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      if (!connected) {
        reject(new Error("Connection closed before response"));
      }
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, params } = body as { method: string; params?: unknown };

    if (!method) {
      return NextResponse.json({ error: "Method required" }, { status: 400 });
    }

    const result = await gatewayRequest(method, params || {});
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const method = searchParams.get("method");

  if (!method) {
    return NextResponse.json({ error: "Method required" }, { status: 400 });
  }

  try {
    const result = await gatewayRequest(method, {});
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
