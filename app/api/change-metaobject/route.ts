import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  }

  try {
    console.log("[v0] === CHANGE METAOBJECT API CALLED ===")

    const body = await request.json()
    console.log("[v0] Request body:", JSON.stringify(body, null, 2))

    const { id, customer, operation, date, type, occasion_name, other_occasion } = body

    if (!id) {
      console.log("[v0] Missing occasion ID")
      return NextResponse.json({ error: "Missing occasion ID" }, { status: 400, headers: corsHeaders })
    }

    if (!customer) {
      console.log("[v0] Missing customer GID")
      return NextResponse.json({ error: "Missing customer GID" }, { status: 400, headers: corsHeaders })
    }

    if (!operation || !["update", "delete"].includes(operation)) {
      console.log("[v0] Invalid or missing operation")
      return NextResponse.json(
        { error: "Operation must be 'update' or 'delete'" },
        { status: 400, headers: corsHeaders },
      )
    }

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

    const apiUrl = `https://${storeDomain}.myshopify.com/admin/api/2025-01/graphql.json`
    console.log("[v0] API URL:", apiUrl)

    let mutation, variables

    if (operation === "delete") {
      mutation = `
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
      variables = { id: `gid://shopify/Metaobject/${id}` }
    } else {
      mutation = `
        mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject {
              id
              handle
              fields {
                key
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `
      variables = {
        id: `gid://shopify/Metaobject/${id}`,
        metaobject: {
          fields: [
            { key: "date", value: date },
            { key: "type", value: type },
            { key: "occasion_name", value: occasion_name },
            { key: "other_occasion", value: other_occasion || "" },
          ],
        },
      }
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

    try {
      const customerGid = customer.startsWith("gid://") ? customer : `gid://shopify/Customer/${customer}`

      if (operation === "delete") {
        // Get current occasions list to count valid occasions
        const getMetafieldQuery = `
          query getCustomerMetafield($customerId: ID!) {
            customer(id: $customerId) {
              metafield(namespace: "custom", key: "my_occasions") {
                id
                value
              }
            }
          }
        `

        const metafieldResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "v0-shopify-app/1.0",
          },
          body: JSON.stringify({
            query: getMetafieldQuery,
            variables: { customerId: customerGid },
          }),
        })

        const metafieldResult = await metafieldResponse.json()
        let occasionsCount = 0

        if (metafieldResult.data?.customer?.metafield?.value) {
          try {
            const existingOccasions = JSON.parse(metafieldResult.data.customer.metafield.value)
            if (Array.isArray(existingOccasions)) {
              // Count will automatically exclude the deleted metaobject since it's now invalid
              occasionsCount = existingOccasions.length - 1 // Subtract 1 for the deleted occasion
            }
          } catch (parseError) {
            occasionsCount = 0
          }
        }

        // Update no_occasions count only
        const updateCountMutation = `
          mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `

        await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "v0-shopify-app/1.0",
          },
          body: JSON.stringify({
            query: updateCountMutation,
            variables: {
              input: {
                id: customerGid,
                metafields: [
                  {
                    namespace: "custom",
                    key: "no_occasions",
                    value: Math.max(0, occasionsCount).toString(),
                    type: "single_line_text_field",
                  },
                ],
              },
            },
          }),
        })

        console.log("[v0] Updated customer no_occasions count after delete:", Math.max(0, occasionsCount))
      } else {
        // For updates, just update the count (occasions list doesn't change)
        const getMetafieldQuery = `
          query getCustomerMetafield($customerId: ID!) {
            customer(id: $customerId) {
              metafield(namespace: "custom", key: "my_occasions") {
                id
                value
              }
            }
          }
        `

        const metafieldResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "v0-shopify-app/1.0",
          },
          body: JSON.stringify({
            query: getMetafieldQuery,
            variables: { customerId: customerGid },
          }),
        })

        const metafieldResult = await metafieldResponse.json()
        let occasionsCount = 0

        if (metafieldResult.data?.customer?.metafield?.value) {
          try {
            const existingOccasions = JSON.parse(metafieldResult.data.customer.metafield.value)
            if (Array.isArray(existingOccasions)) {
              occasionsCount = existingOccasions.length
            }
          } catch (parseError) {
            occasionsCount = 0
          }
        }

        // Update no_occasions count
        const updateCountMutation = `
          mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `

        await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "v0-shopify-app/1.0",
          },
          body: JSON.stringify({
            query: updateCountMutation,
            variables: {
              input: {
                id: customerGid,
                metafields: [
                  {
                    namespace: "custom",
                    key: "no_occasions",
                    value: occasionsCount.toString(),
                    type: "single_line_text_field",
                  },
                ],
              },
            },
          }),
        })

        console.log("[v0] Updated customer no_occasions count after update:", occasionsCount)
      }
    } catch (metafieldError) {
      console.error("[v0] Error updating customer metafields:", metafieldError)
      // Don't fail the whole request if metafield update fails
    }

    if (operation === "delete") {
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
    } else {
      const updateResult = responseData.data?.metaobjectUpdate
      if (updateResult?.userErrors && updateResult.userErrors.length > 0) {
        console.log("[v0] User errors:", updateResult.userErrors)
        return NextResponse.json(
          { error: "User errors", details: updateResult.userErrors },
          { status: 400, headers: corsHeaders },
        )
      }

      console.log("[v0] SUCCESS: Metaobject updated successfully")
      console.log("[v0] Updated metaobject:", updateResult?.metaobject)

      return NextResponse.json(
        {
          success: true,
          metaobject: updateResult?.metaobject,
          message: "Metaobject updated successfully",
        },
        { headers: corsHeaders },
      )
    }
  } catch (error) {
    console.error("[v0] Change API error:", error)
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
