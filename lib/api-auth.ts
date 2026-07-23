import { type NextRequest, NextResponse } from "next/server"

/**
 * Shared CORS headers for the occasions APIs.
 * The custom `x-api-key` header must be allowlisted so browser-based
 * preflight (OPTIONS) requests succeed. Native mobile clients (Tapcart)
 * are not subject to CORS but send the same header.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, x-api-key",
}

/**
 * Verifies the shared secret sent by trusted clients (Shopify page, Tapcart app).
 *
 * Set OCCASIONS_API_KEY in the Vercel project env vars, and send the same value
 * in the `x-api-key` request header from every client.
 *
 * Returns a 401/500 NextResponse when the request is not authorized, or `null`
 * when the request is authorized and processing should continue.
 */
export function checkApiKey(request: NextRequest): NextResponse | null {
  const expectedKey = process.env.OCCASIONS_API_KEY

  // Fail closed: if the secret isn't configured, don't allow writes/reads.
  if (!expectedKey) {
    console.error("[v0] OCCASIONS_API_KEY is not set on the server")
    return NextResponse.json(
      { error: "Server auth is not configured" },
      { status: 500, headers: corsHeaders },
    )
  }

  const providedKey = request.headers.get("x-api-key")

  if (!providedKey || providedKey !== expectedKey) {
    console.log("[v0] Unauthorized request - invalid or missing x-api-key")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders })
  }

  return null
}
