import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  }

  try {
    console.log("[v0] === DELETE METAOBJECT API CALLED ===")

    const body = await request.json()
    console.log("[v0] Request body:", JSON.stringify(body, null, 2))

    const { id, customer } = body

    if (!id) {
      console.log("[v0] Missing occasion ID")
      return NextResponse.json({ error: "Missing occasion ID" }, { status: 400, headers: corsHeaders })
    }

    if (!customer) {
      console.log("[v0] Missing customer GID")
      return NextResponse.json({ error: "Missing customer GID" }, { status: 400, headers: corsHeaders })
    }

    // Environment variables
    const storeDomain = process.env.STORE_DOMAIN
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN

    console.log("[v0] Store domain:", storeDomain ? `${storeDomain}.myshopify.com` : "NOT SET")
    console.log("[v0] Access token length:", accessToken ? accessToken.length : "NOT SET")

    if (!storeDomain || !accessToken) {
      console.log("[v0] Missing environment variables")
      return NextResponse.json(
        { error: "Missing required environment variables" },
        { status: 500, headers: corsHeaders },
      )
    }

    // Construct API URL
    const apiUrl = `https://${storeDomain}.myshopify.com/admin/api/2025-01/graphql.json`
    console.log("[v0] API URL:", apiUrl)

    // GraphQL mutation to delete metaobject
    const mutation = `
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      id: id,
    }

    console.log("[v0] GraphQL mutation:", mutation)
    console.log("[v0] Variables:", JSON.stringify(variables, null, 2))

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
        "User-Agent": "v0-shopify-app/1.0",
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    })

    console.log("[v0] Shopify API response status:", response.status)
    console.log("[v0] Shopify API response ok:", response.ok)

    const responseText = await response.text()
    console.log("[v0] Shopify API raw response:", responseText)

    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch (parseError) {
      console.error("[v0] Failed to parse Shopify response:", parseError)
      return NextResponse.json({ error: "Invalid response from Shopify API" }, { status: 500, headers: corsHeaders })
    }

    if (!response.ok) {
      console.log("[v0] Shopify API HTTP error:", response.status)
      return NextResponse.json(
        { error: `Shopify API HTTP error: ${response.status}` },
        { status: response.status, headers: corsHeaders },
      )
    }

    if (responseData.errors) {
      console.log("[v0] GraphQL errors:", responseData.errors)
      return NextResponse.json(
        { error: "GraphQL errors", details: responseData.errors },
        { status: 400, headers: corsHeaders },
      )
    }

    const deleteResult = responseData.data?.metaobjectDelete
    if (deleteResult?.userErrors && deleteResult.userErrors.length > 0) {
      console.log("[v0] User errors:", deleteResult.userErrors)
      return NextResponse.json(
        { error: "User errors", details: deleteResult.userErrors },
        { status: 400, headers: corsHeaders },
      )
    }

    console.log("[v0] SUCCESS: Metaobject deleted successfully")
    console.log("[v0] Deleted ID:", deleteResult?.deletedId)

    return NextResponse.json(
      {
        success: true,
        deletedId: deleteResult?.deletedId,
        message: "Metaobject deleted successfully",
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    console.error("[v0] Delete API error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500, headers: corsHeaders },
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  })
}
