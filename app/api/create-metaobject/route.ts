import { type NextRequest, NextResponse } from "next/server"

// You'll need to add these environment variables to your Vercel project:
// SHOPIFY_STORE_URL - Your Shopify store URL (e.g., your-store.myshopify.com)
// SHOPIFY_ACCESS_TOKEN - Your Shopify Admin API access token
// STORE_DOMAIN - Your Shopify store domain (e.g., your-store)

interface CustomerEventData {
  id?: string // Added optional id field for updates
  customer: string
  date: string
  type: string // Changed from occasion_type to type to match new custom.type field
  other_occasion?: string
  occasion_name: string
}

export async function POST(request: NextRequest) {
  try {
    const eventData: CustomerEventData = await request.json()

    if (!eventData.customer || !eventData.date || !eventData.type || !eventData.occasion_name) {
      return NextResponse.json({ error: "Customer, date, type, and occasion name are required" }, { status: 400 })
    }

    const shopifyUrl = process.env.SHOPIFY_STORE_URL
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
    const storeDomain = process.env.STORE_DOMAIN

    if (!shopifyUrl || !accessToken || !storeDomain) {
      console.error(
        "[v0] Missing Shopify configuration - URL:",
        !!shopifyUrl,
        "Token:",
        !!accessToken,
        "Domain:",
        !!storeDomain,
      )
      return NextResponse.json({ error: "Shopify configuration missing" }, { status: 500 })
    }

    const apiUrl = `https://${storeDomain}.myshopify.com/admin/api/2025-01/graphql.json`
    console.log("[v0] Using store domain from env var:", apiUrl)
    console.log("[v0] Access token length:", accessToken.length)

    const isUpdate = !!eventData.id
    console.log("[v0] Operation type:", isUpdate ? "UPDATE" : "CREATE")

    let shopifyId = eventData.id
    if (isUpdate && eventData.id && !eventData.id.startsWith("gid://")) {
      shopifyId = `gid://shopify/Metaobject/${eventData.id}`
      console.log("[v0] Converted ID to GID format:", shopifyId)
    }

    const graphqlMutation = isUpdate
      ? `
        mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject {
              id
              handle
              type
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
      : `
        mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
              id
              handle
              type
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

    const variables = isUpdate
      ? {
          id: shopifyId, // Use converted GID format
          metaobject: {
            fields: [
              {
                key: "customer",
                value: eventData.customer,
              },
              {
                key: "date",
                value: eventData.date,
              },
              {
                key: "type",
                value: eventData.type,
              },
              {
                key: "other_occasion",
                value: eventData.other_occasion || "",
              },
              {
                key: "occasion_name",
                value: eventData.occasion_name,
              },
            ],
          },
        }
      : {
          metaobject: {
            type: "customer_event",
            fields: [
              {
                key: "customer",
                value: eventData.customer,
              },
              {
                key: "date",
                value: eventData.date,
              },
              {
                key: "type",
                value: eventData.type,
              },
              {
                key: "other_occasion",
                value: eventData.other_occasion || "",
              },
              {
                key: "occasion_name",
                value: eventData.occasion_name,
              },
            ],
          },
        }

    console.log("[v0] Making GraphQL request to Shopify")
    console.log("[v0] Request payload:", JSON.stringify({ query: graphqlMutation, variables }, null, 2))

    let response
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "User-Agent": "Shopify-Metaobject-App/1.0",
        },
        body: JSON.stringify({
          query: graphqlMutation,
          variables: variables,
        }),
      })
    } catch (fetchError) {
      console.error("[v0] Fetch error:", fetchError)
      return NextResponse.json(
        {
          error: `Network error: ${fetchError instanceof Error ? fetchError.message : "Unknown fetch error"}`,
        },
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

    console.log("[v0] Response status:", response.status)
    console.log("[v0] Response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorData = await response.text()
      console.error("[v0] Shopify API HTTP error:", response.status, errorData)
      return NextResponse.json(
        {
          error: `Shopify API error (${response.status}): ${errorData}`,
        },
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

    const result = await response.json()
    console.log("[v0] Shopify API response:", JSON.stringify(result, null, 2))

    if (result.errors) {
      console.error("[v0] GraphQL errors:", result.errors)
      return NextResponse.json(
        {
          error: "GraphQL errors occurred",
          details: result.errors.map((err: any) => err.message).join(", "),
          graphqlErrors: result.errors,
        },
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

    const operation = isUpdate ? "metaobjectUpdate" : "metaobjectCreate"
    const operationResult = result.data?.[operation]

    if (operationResult?.userErrors?.length > 0) {
      const userErrors = operationResult.userErrors
      console.error("[v0] User errors:", userErrors)
      return NextResponse.json(
        {
          error: `Shopify validation errors: ${userErrors.map((e: any) => e.message).join(", ")}`,
        },
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

    const metaobject = operationResult?.metaobject

    if (!metaobject) {
      console.error(`[v0] No metaobject returned from Shopify ${operation}`)
      return NextResponse.json(
        { error: `Failed to ${isUpdate ? "update" : "create"} metaobject` },
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

    console.log(`[v0] Successfully ${isUpdate ? "updated" : "created"} metaobject:`, metaobject.id)

    if (!isUpdate) {
      try {
        console.log("[v0] Adding metaobject to customer's my_occasions list")

        // First, get the current customer metafield value
        const customerMetafieldQuery = `
          query getCustomerMetafield($customerId: ID!) {
            customer(id: $customerId) {
              metafield(namespace: "custom", key: "my_occasions") {
                id
                value
              }
            }
          }
        `

        const customerGid = eventData.customer.startsWith("gid://")
          ? eventData.customer
          : `gid://shopify/Customer/${eventData.customer}`

        const metafieldResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "Shopify-Metaobject-App/1.0",
          },
          body: JSON.stringify({
            query: customerMetafieldQuery,
            variables: { customerId: customerGid },
          }),
        })

        const metafieldResult = await metafieldResponse.json()
        console.log("[v0] Customer metafield query result:", JSON.stringify(metafieldResult, null, 2))

        // Parse existing occasions list or create empty array
        let existingOccasions = []
        const currentMetafield = metafieldResult.data?.customer?.metafield

        if (currentMetafield?.value) {
          try {
            existingOccasions = JSON.parse(currentMetafield.value)
            if (!Array.isArray(existingOccasions)) {
              existingOccasions = []
            }
          } catch (parseError) {
            console.log("[v0] Could not parse existing metafield value, starting with empty array")
            existingOccasions = []
          }
        }

        // Add the new metaobject ID to the list
        existingOccasions.push(metaobject.id)
        console.log("[v0] Updated occasions list:", existingOccasions)

        // Update the customer metafield with the combined list
        const updateMetafieldMutation = `
          mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                metafield(namespace: "custom", key: "my_occasions") {
                  id
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

        const updateResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "Shopify-Metaobject-App/1.0",
          },
          body: JSON.stringify({
            query: updateMetafieldMutation,
            variables: {
              input: {
                id: customerGid,
                metafields: [
                  {
                    namespace: "custom",
                    key: "my_occasions",
                    value: JSON.stringify(existingOccasions),
                    type: "list.metaobject_reference",
                  },
                ],
              },
            },
          }),
        })

        const updateResult = await updateResponse.json()
        console.log("[v0] Customer metafield update result:", JSON.stringify(updateResult, null, 2))

        if (updateResult.data?.customerUpdate?.userErrors?.length > 0) {
          console.error("[v0] Customer metafield update errors:", updateResult.data.customerUpdate.userErrors)
        } else {
          console.log("[v0] Successfully added metaobject to customer's occasions list")
        }
      } catch (metafieldError) {
        console.error("[v0] Error updating customer metafield:", metafieldError)
      }
    } else {
      try {
        console.log("[v0] Syncing customer occasion count for update")

        const customerGid = eventData.customer.startsWith("gid://")
          ? eventData.customer
          : `gid://shopify/Customer/${eventData.customer}`

        // Get both metafields to compare counts
        const syncQuery = `
          query getCustomerMetafields($customerId: ID!) {
            customer(id: $customerId) {
              myOccasions: metafield(namespace: "custom", key: "my_occasions") {
                id
                value
              }
              noOccasions: metafield(namespace: "custom", key: "no_occasions") {
                id
                value
              }
            }
          }
        `

        const syncResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            "User-Agent": "Shopify-Metaobject-App/1.0",
          },
          body: JSON.stringify({
            query: syncQuery,
            variables: { customerId: customerGid },
          }),
        })

        const syncResult = await syncResponse.json()
        const customer = syncResult.data?.customer

        let actualCount = 0
        let storedCount = 0

        // Count actual occasions in the list
        if (customer?.myOccasions?.value) {
          try {
            const occasionsList = JSON.parse(customer.myOccasions.value)
            if (Array.isArray(occasionsList)) {
              actualCount = occasionsList.length
            }
          } catch (parseError) {
            console.log("[v0] Could not parse occasions list for sync")
          }
        }

        // Get stored count
        if (customer?.noOccasions?.value) {
          storedCount = Number.parseInt(customer.noOccasions.value) || 0
        }

        console.log("[v0] Count sync - Actual:", actualCount, "Stored:", storedCount)

        // Update count if they don't match
        if (actualCount !== storedCount) {
          console.log("[v0] Counts don't match, updating no_occasions to:", actualCount)

          const syncCountMutation = `
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
              "User-Agent": "Shopify-Metaobject-App/1.0",
            },
            body: JSON.stringify({
              query: syncCountMutation,
              variables: {
                input: {
                  id: customerGid,
                  metafields: [
                    {
                      namespace: "custom",
                      key: "no_occasions",
                      value: actualCount.toString(),
                      type: "number_integer",
                    },
                  ],
                },
              },
            }),
          })

          console.log("[v0] Successfully synced no_occasions count to:", actualCount)
        }
      } catch (syncError) {
        console.error("[v0] Error syncing no_occasions:", syncError)
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: isUpdate ? "Metaobject updated successfully" : "Metaobject created successfully",
        metaobject: metaobject,
        operation: isUpdate ? "updated" : "created",
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Error creating metaobject:", error)
    if (error instanceof Error) {
      console.error("[v0] Error name:", error.name)
      console.error("[v0] Error message:", error.message)
      console.error("[v0] Error stack:", error.stack)
    }
    return NextResponse.json(
      { error: "Internal server error" },
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
