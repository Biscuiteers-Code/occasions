/**
 * Audit script: find customer_event metaobjects that are NOT referenced in their
 * owning customer's custom.my_occasions metafield list.
 *
 * These "orphans" are invisible in the UI, because both the Shopify theme and the
 * Tapcart app read occasions via the my_occasions reference list rather than by
 * querying metaobjects directly.
 *
 * READ ONLY. This script makes no writes.
 *
 * Customers are looked up in batches of 250 via nodes(), so the whole audit is
 * ~100 requests rather than one per customer.
 *
 * Run:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/audit-orphan-occasions.mjs
 *
 * Writes a machine-readable summary to /tmp/orphan-audit.json for the backfill script.
 */

import { writeFileSync } from "node:fs"

const STORE_DOMAIN = process.env.STORE_DOMAIN
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

if (!STORE_DOMAIN || !ACCESS_TOKEN) {
  console.error("Missing STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN")
  process.exit(1)
}

const API_URL = `https://${STORE_DOMAIN}.myshopify.com/admin/api/2025-01/graphql.json`
const OUT_FILE = "/tmp/orphan-audit.json"

async function shopify(query, variables = {}, attempt = 1) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  })

  // Back off and retry on throttling
  if (res.status === 429 && attempt <= 5) {
    await new Promise((r) => setTimeout(r, 2000 * attempt))
    return shopify(query, variables, attempt + 1)
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const json = await res.json()

  if (json.errors) {
    const throttled = JSON.stringify(json.errors).includes("THROTTLED")
    if (throttled && attempt <= 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return shopify(query, variables, attempt + 1)
    }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`)
  }

  return json.data
}

/** Fetch every customer_event metaobject, following pagination. */
async function fetchAllMetaobjects() {
  const query = `
    query getAll($cursor: String) {
      metaobjects(type: "customer_event", first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            handle
            fields { key value }
          }
        }
      }
    }
  `

  const all = []
  let cursor = null

  do {
    const data = await shopify(query, { cursor })
    const conn = data.metaobjects

    for (const edge of conn.edges) {
      const fields = {}
      for (const f of edge.node.fields) fields[f.key] = f.value
      all.push({ id: edge.node.id, handle: edge.node.handle, fields })
    }

    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null
    process.stderr.write(`  fetched ${all.length} metaobjects...\r`)
  } while (cursor)

  process.stderr.write("\n")
  return all
}

/**
 * Batch-fetch customers by GID and return a Map of gid -> { exists, listed[] }.
 * Uses nodes() so we get 250 customers per request instead of one.
 */
async function fetchCustomerLists(customerGids) {
  const query = `
    query getLists($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Customer {
          id
          metafield(namespace: "custom", key: "my_occasions") {
            value
          }
        }
      }
    }
  `

  const result = new Map()
  const BATCH = 250

  for (let i = 0; i < customerGids.length; i += BATCH) {
    const batch = customerGids.slice(i, i + BATCH)
    const data = await shopify(query, { ids: batch })

    // nodes() returns results positionally, with null for ids that don't resolve
    data.nodes.forEach((node, idx) => {
      const gid = batch[idx]

      if (!node) {
        result.set(gid, { exists: false, listed: [] })
        return
      }

      const raw = node.metafield?.value
      let listed = []

      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) listed = parsed
        } catch {
          // Malformed metafield value, treat as empty
        }
      }

      result.set(gid, { exists: true, listed })
    })

    process.stderr.write(`  checked ${Math.min(i + BATCH, customerGids.length)}/${customerGids.length} customers...\r`)
  }

  process.stderr.write("\n")
  return result
}

const main = async () => {
  console.log("Fetching all customer_event metaobjects...")
  const metaobjects = await fetchAllMetaobjects()
  console.log(`Total metaobjects: ${metaobjects.length}\n`)

  // Group metaobjects by their owning customer
  const byCustomer = new Map()
  const noCustomer = []

  for (const mo of metaobjects) {
    const customer = (mo.fields.customer || "").trim()
    if (!customer) {
      noCustomer.push(mo)
      continue
    }
    if (!byCustomer.has(customer)) byCustomer.set(customer, [])
    byCustomer.get(customer).push(mo)
  }

  console.log(`Distinct customers: ${byCustomer.size}`)
  if (noCustomer.length) {
    console.log(`Metaobjects with no customer field: ${noCustomer.length} (cannot be linked)`)
  }
  console.log("")

  console.log("Reading my_occasions lists in batches...")
  const lists = await fetchCustomerLists([...byCustomer.keys()])
  console.log("")

  const fixable = []
  const missingCustomers = []
  let totalOrphans = 0
  let customersWithOrphans = 0

  for (const [customerGid, mos] of byCustomer) {
    const entry = lists.get(customerGid)

    if (!entry || !entry.exists) {
      missingCustomers.push({ customerGid, count: mos.length })
      continue
    }

    const listedSet = new Set(entry.listed)
    const orphans = mos.filter((mo) => !listedSet.has(mo.id))

    if (orphans.length) {
      customersWithOrphans++
      totalOrphans += orphans.length
      fixable.push({
        customerGid,
        listed: entry.listed,
        orphanIds: orphans.map((o) => o.id),
        orphanSample: orphans.slice(0, 3).map((o) => ({
          handle: o.handle,
          name: o.fields.occasion_name || "",
          type: o.fields.type || "",
          date: o.fields.date || "",
        })),
      })
    }
  }

  console.log("=".repeat(70))
  console.log("RESULTS")
  console.log("=".repeat(70))
  console.log(`Total occasions:                   ${metaobjects.length}`)
  console.log(`Distinct customers:                ${byCustomer.size}`)
  console.log(`Customers with orphaned occasions: ${customersWithOrphans}`)
  console.log(`Total orphaned occasions:          ${totalOrphans}`)

  if (missingCustomers.length) {
    const n = missingCustomers.reduce((a, c) => a + c.count, 0)
    console.log(`Deleted/missing customers:         ${missingCustomers.length} (${n} occasions, unfixable)`)
  }
  if (noCustomer.length) {
    console.log(`No customer field:                 ${noCustomer.length} (unfixable)`)
  }
  console.log("")

  // Distribution, to show whether this is a systemic problem or a long tail
  const buckets = { "1": 0, "2-3": 0, "4-10": 0, "11+": 0 }
  for (const f of fixable) {
    const n = f.orphanIds.length
    if (n === 1) buckets["1"]++
    else if (n <= 3) buckets["2-3"]++
    else if (n <= 10) buckets["4-10"]++
    else buckets["11+"]++
  }
  console.log("Orphans per customer:")
  for (const [k, v] of Object.entries(buckets)) {
    if (v) console.log(`  ${k.padEnd(6)} orphan(s): ${v} customers`)
  }
  console.log("")

  console.log("Sample of affected customers (first 15):")
  for (const f of fixable.slice(0, 15)) {
    const id = f.customerGid.split("/").pop()
    console.log(`  Customer ${id}: ${f.listed.length} listed, ${f.orphanIds.length} orphaned`)
    for (const s of f.orphanSample) {
      console.log(`     - ${s.handle} | ${s.name} | ${s.type} | ${s.date}`)
    }
  }
  console.log("")

  writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), fixable }, null, 2))
  console.log(`Wrote plan for ${fixable.length} customers to ${OUT_FILE}`)

  if (totalOrphans === 0) console.log("\nNo orphans found. Nothing to fix.")
}

main().catch((err) => {
  console.error("\nFailed:", err.message)
  process.exit(1)
})
