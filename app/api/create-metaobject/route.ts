import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // or 'edge' if you prefer

type CustomerEventData = {
  customer: string;
  date: string;
  occasion_type: string;
  other_occasion?: string;
  occasion_name: string;
};

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*"); // lock to your store if you want
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

function normalizeAdminDomain(input?: string): string | null {
  if (!input) return null;
  let s = input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!s.includes(".myshopify.com")) s = `${s}.myshopify.com`;
  return s;
}

async function shopifyFetch(
  shop: string,
  token: string,
  body: Record<string, unknown>,
) {
  const url = `https://${shop}/admin/api/2025-01/graphql.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      "User-Agent": "CustomerEventMetaobject/1.0",
    },
    body: JSON.stringify(body),
  });
  return r;
}

const mutation = /* GraphQL */ `
  mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle type }
      userErrors { field message }
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as CustomerEventData;

    // Basic validation
    if (!data?.customer || !data?.date || !data?.occasion_type || !data?.occasion_name) {
      return cors(
        NextResponse.json(
          { error: "customer, date, occasion_type, occasion_name are required" },
          { status: 400 },
        ),
      );
    }

    const shop = normalizeAdminDomain(process.env.SHOPIFY_STORE_URL);
    const token = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shop || !token) {
      console.error("[metaobject] Missing envs", { hasShop: !!shop, hasToken: !!token });
      return cors(NextResponse.json({ error: "Server not configured for Shopify" }, { status: 500 }));
    }

    const variables = {
      metaobject: {
        type: "customer_event",
        fields: [
          { key: "customer", value: data.customer },
          { key: "date", value: data.date },
          { key: "occasion_type", value: data.occasion_type },
          { key: "other_occasion", value: data.other_occasion || "" },
          { key: "occasion_name", value: data.occasion_name },
        ],
      },
    };

    // (Optional) Simple retry for 429
    let resp = await shopifyFetch(shop, token, { query: mutation, variables });
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 600));
      resp = await shopifyFetch(shop, token, { query: mutation, variables });
    }

    const text = await resp.text();
    if (!resp.ok) {
      console.error("[metaobject] HTTP", resp.status, text?.slice(0, 500));
      return cors(
        NextResponse.json({ error: `Shopify API error (${resp.status})` }, { status: 502 }),
      );
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("[metaobject] Non-JSON response:", text?.slice(0, 500));
      return cors(NextResponse.json({ error: "Invalid JSON from Shopify" }, { status: 502 }));
    }

    if (json.errors) {
      console.error("[metaobject] GraphQL errors", json.errors);
      return cors(NextResponse.json({ error: "GraphQL errors", details: json.errors }, { status: 502 }));
    }

    const payload = json?.data?.metaobjectCreate;
    if (!payload?.metaobject) {
      const errs = payload?.userErrors || [];
      console.error("[metaobject] User errors", errs);
      return cors(
        NextResponse.json(
          { error: "Validation errors", details: errs.map((e: any) => e.message) },
          { status: 400 },
        ),
      );
    }

    return cors(NextResponse.json({ success: true, metaobject: payload.metaobject }));
  } catch (e: any) {
    console.error("[metaobject] Uncaught", e);
    return cors(NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}
