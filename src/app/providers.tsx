"use client";

import { GatewayProvider } from "@/lib/gateway-context";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Get gateway URL from environment or default
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:18789";
  const gatewayToken = process.env.NEXT_PUBLIC_GATEWAY_TOKEN;

  return (
    <GatewayProvider gatewayUrl={gatewayUrl} gatewayToken={gatewayToken}>
      {children}
    </GatewayProvider>
  );
}
