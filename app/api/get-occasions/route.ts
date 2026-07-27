import { type NextRequest, NextResponse } from "next/server"
import { checkApiKey, corsHeaders } from "@/lib/api-auth"

export async function POST(request: NextRequest) {
  const unauthorized = checkApiKey(request)
  if (unauthorized) return unauthorized

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

    // Read the occasions from the customer's custom.my_occasions metafield.
    // It is a list.metaobject_reference, so `references` resolves the linked
    // customer_event metaobjects directly. There is no customer.metaobjects
    // field on the Admin API, so the references connection is the only way in.
    const query = `
      query getCustomerOccasions($customer: ID!) {
        customer(id: $customer) {
          id
          metafield(namespace: "custom", key: "my_occasions") {
            id
            value
            references(first: 50) {
              edges {
                node {
                  ... on Metaobject {
                    id
                    handle
                    type
                    fields {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

    // Accept either a full GID or a bare numeric id from the client
    const customerGid = String(customer).startsWith("gid://")
      ? String(customer)
      : `gid://shopify/Customer/${String(customer).replace(/\D/g, "")}`

    const variables = {
      customer: customerGid,
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

    // Parse the resolved metaobject references from the customer metafield
    const customerData = responseData.data?.customer

    if (!customerData) {
      console.log("[v0] Customer not found:", customerGid)
      return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders })
    }

    const references = customerData.metafield?.references?.edges || []

    const occasions = references
      // Guard against references that failed to resolve, or that point at a
      // different metaobject type than the one we expect
      .map((edge) => edge?.node)
      .filter((node) => node && node.id && (!node.type || node.type === "customer_event"))
      .map((metaobject) => {
        const fields = {}

        // Convert fields array to object
        ;(metaobject.fields || []).forEach((field) => {
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
    headers: corsHeaders,
  })
}
