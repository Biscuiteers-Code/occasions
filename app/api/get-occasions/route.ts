import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  }

  try {
    console.log("[v0] === GET OCCASIONS API CALLED ===")

    const body = await request.json()
    console.log("[v0] Request body:", JSON.stringify(body, null, 2))

    const { customer } = body

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

    // GraphQL query to get customer metaobjects
    const query = `
      query getCustomerMetaobjects($customer: ID!) {
        customer(id: $customer) {
          id
          metaobjects(first: 50, type: "customer_event") {
            edges {
              node {
                id
                handle
                fields {
                  key
                  value
                }
              }
            }
          }
        }
      }
    `

    const variables = {
      customer: customer,
    }

    console.log("[v0] GraphQL query:", query)
    console.log("[v0] Variables:", JSON.stringify(variables, null, 2))

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
        "User-Agent": "v0-shopify-app/1.0",
      },
      body: JSON.stringify({
        query: query,
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

    // Parse metaobjects from response
    const customerData = responseData.data?.customer
    const metaobjects = customerData?.metaobjects?.edges || []

    const occasions = metaobjects.map((edge) => {
      const metaobject = edge.node
      const fields = {}

      // Convert fields array to object
      metaobject.fields.forEach((field) => {
        fields[field.key] = field.value
      })

      return {
        id: metaobject.id,
        handle: metaobject.handle,
        occasion_name: fields.occasion_name || "",
        type: fields.type || "",
        date: fields.date || "",
        other_occasion: fields.other_occasion || "",
      }
    })

    console.log("[v0] SUCCESS: Found", occasions.length, "occasions")
    console.log("[v0] Occasions:", occasions)

    return NextResponse.json(
      {
        success: true,
        occasions: occasions,
        count: occasions.length,
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    console.error("[v0] Get occasions API error:", error)
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
