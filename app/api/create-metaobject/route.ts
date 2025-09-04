export async function POST(request: Request) {
  try {
    const { type, field } = await request.json()

    console.log("[v0] Getting metaobject definition for:", { type, field })

    const storeUrl = process.env.SHOPIFY_STORE_URL
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN

    if (!storeUrl || !accessToken) {
      return Response.json({ error: "Missing Shopify credentials" }, { status: 500 })
    }

    // Use the correct store URL (the one that works)
    const apiUrl = `https://1eq5ty-dr.myshopify.com/admin/api/2025-01/graphql.json`

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

    if (!response.ok) {
      console.error("[v0] Shopify API error:", response.status, response.statusText)
      return Response.json({ error: `Shopify API error: ${response.status}` }, { status: response.status })
    }

    const data = await response.json()
    console.log("[v0] GraphQL response:", JSON.stringify(data, null, 2))

    if (data.errors) {
      console.error("[v0] GraphQL errors:", data.errors)
      return Response.json({ error: "GraphQL errors", details: data.errors }, { status: 400 })
    }

    // Find the customer_event metaobject definition
    const customerEventDef = data.data?.metaobjectDefinitions?.edges?.find((edge) => edge.node.type === type)

    if (!customerEventDef) {
      console.log("[v0] Metaobject definition not found for type:", type)
      return Response.json({ error: `Metaobject definition not found for type: ${type}` }, { status: 404 })
    }

    // Find the occasion_type field
    const occasionField = customerEventDef.node.fieldDefinitions.find((fieldDef) => fieldDef.key === field)

    if (!occasionField) {
      console.log("[v0] Field not found:", field)
      return Response.json({ error: `Field not found: ${field}` }, { status: 404 })
    }

    // Extract choices from validations
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

    return Response.json({
      choices,
      fieldDefinition: occasionField,
    })
  } catch (error) {
    console.error("[v0] Error getting metaobject definition:", error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
