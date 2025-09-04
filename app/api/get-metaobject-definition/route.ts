import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] === GET METAOBJECT DEFINITION API CALLED ===")

    // Parse request body
    let requestBody
    try {
      requestBody = await request.json()
      console.log("[v0] Request body:", JSON.stringify(requestBody, null, 2))
    } catch (parseError) {
      console.error("[v0] Failed to parse request body:", parseError)
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      )
    }

    const { type, field } = requestBody

    console.log("[v0] Getting metaobject definition for:", { type, field })

    // Check environment variables
    const storeUrl = process.env.SHOPIFY_STORE_URL
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
    const storeDomain = process.env.STORE_DOMAIN

    console.log("[v0] Environment variables check:")
    console.log("[v0] - SHOPIFY_STORE_URL:", storeUrl ? "✓ Set" : "✗ Missing")
    console.log("[v0] - SHOPIFY_ACCESS_TOKEN:", accessToken ? `✓ Set (${accessToken.length} chars)` : "✗ Missing")
    console.log("[v0] - STORE_DOMAIN:", storeDomain ? `✓ Set (${storeDomain})` : "✗ Missing")

    if (!accessToken || !storeDomain) {
      const missingVars = []
      if (!accessToken) missingVars.push("SHOPIFY_ACCESS_TOKEN")
      if (!storeDomain) missingVars.push("STORE_DOMAIN")

      console.error("[v0] Missing required environment variables:", missingVars)
      return NextResponse.json(
        { error: `Missing required environment variables: ${missingVars.join(", ")}` },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      )
    }

    const apiUrl = `https://${storeDomain}.myshopify.com/admin/api/2025-01/graphql.json`
    console.log("[v0] Constructed API URL:", apiUrl)

    const query = `
      query {
        metaobjectDefinitions(first: 10) {
          edges {
            node {
              id
              type
              fieldDefinitions {
                key
                name
                type {
                  name
                }
                validations {
                  name
                  value
                }
              }
            }
          }
        }
      }
    `

    console.log("[v0] Querying Shopify GraphQL API:", apiUrl)

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query }),
    })

    console.log("[v0] Shopify API response status:", response.status)
    console.log("[v0] Shopify API response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] Shopify API error:", response.status, response.statusText)
      console.error("[v0] Shopify API error body:", errorText)
      return NextResponse.json(
        { error: `Shopify API error: ${response.status} - ${errorText}` },
        {
          status: response.status,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      )
    }

    const data = await response.json()
    console.log("[v0] GraphQL response:", JSON.stringify(data, null, 2))

    if (data.errors) {
      console.error("[v0] GraphQL errors:", data.errors)
      return NextResponse.json(
        { error: "GraphQL errors", details: data.errors },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      )
    }

    const customerEventDef = data.data?.metaobjectDefinitions?.edges?.find((edge) => edge.node.type === type)

    if (!customerEventDef) {
      console.log("[v0] Metaobject definition not found for type:", type)
      return NextResponse.json(
        { error: `Metaobject definition not found for type: ${type}` },
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      )
    }

    const occasionField = customerEventDef.node.fieldDefinitions.find((fieldDef) => fieldDef.key === field)

    if (!occasionField) {
      console.log("[v0] Field not found:", field)
      return NextResponse.json(
        { error: `Field not found: ${field}` },
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        },
      )
    }

    let choices = []
    if (occasionField.validations) {
      for (const validation of occasionField.validations) {
        if (validation.name === "choices" && validation.value) {
          try {
            const parsedChoices = JSON.parse(validation.value)
            if (Array.isArray(parsedChoices)) {
              choices = parsedChoices
            }
          } catch (e) {
            console.error("[v0] Error parsing choices:", e)
          }
        }
      }
    }

    console.log("[v0] Extracted choices:", choices)

    return NextResponse.json(
      {
        choices,
        fieldDefinition: occasionField,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Unexpected error in get-metaobject-definition:", error)
    console.error("[v0] Error stack:", error.stack)
    return NextResponse.json(
      { error: `Unexpected error: ${error.message}` },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}


