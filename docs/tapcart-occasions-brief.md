# Occasions Block — Tapcart Build Brief

Replicate our Shopify "Occasions Manager" block as a Tapcart Custom Block.

Customers save occasion reminders (birthdays, anniversaries). Each reminder is a Shopify
`customer_event` metaobject, linked to the customer via their
`custom.my_occasions` metafield.

**You do not need Shopify API access.** All Shopify logic lives behind 4 REST endpoints
on our Vercel app. You only build UI + `fetch` calls.

**Status:** all 4 endpoints are live in production and verified working. Nothing is
blocked — you can start building immediately.

---

## 1. Setup

**Base URL**

```
https://v0-shopify-metaobject-app.vercel.app
```

**Auth** — every request needs both headers. Ask Matt for the key value; do not commit it.

```
Content-Type: application/json
x-api-key: <OCCASIONS_API_KEY>
```

Missing or wrong key returns `401`. All endpoints are `POST` (yes, even the reads).

**Customer ID** — every endpoint expects a full Shopify GID:

```js
const customerGid = `gid://shopify/Customer/${numericId}`
```

Tapcart gives you the customer via `useVariables()`. Normalise whatever shape it returns
into the GID format above.

**Smoke test** — run this first to confirm your key works before writing any UI:

```bash
curl -X POST https://v0-shopify-metaobject-app.vercel.app/api/get-metaobject-definition \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{"type":"customer_event","field":"type"}'
```

A working key returns a `choices` array of 9 occasion types. A `401` means the key is
wrong or missing.

---

## 2. Endpoints

### Read — list a customer's occasions

`POST /api/get-occasions`

```json
{ "customer": "gid://shopify/Customer/9546466394443" }
```

Response:

```json
{
  "occasions": [
    {
      "id": "gid://shopify/Metaobject/123456789",
      "handle": "mums-birthday-abc",
      "occasion_name": "Mum's birthday",
      "type": "Mum's Birthday",
      "date": "2014-01-01",
      "other_occasion": ""
    }
  ]
}
```

Returns `404` if the customer doesn't exist. Empty list is `{ "occasions": [] }`.

### Create

`POST /api/create-metaobject`

```json
{
  "customer": "gid://shopify/Customer/9546466394443",
  "date": "2025-04-03",
  "type": "Family Birthday",
  "occasion_name": "The big one",
  "other_occasion": ""
}
```

`customer`, `date`, `type`, `occasion_name` are all required (`400` if missing).
`date` must be `YYYY-MM-DD`. Returns `{ success: true, metaobject: {...}, operation: "created" }`.

This also appends the new record to the customer's `my_occasions` list and updates their
`no_occasions` count — so you don't have to.

### Update

`POST /api/create-metaobject` — same endpoint, but include `id`. Presence of `id` switches
it to update mode.

```json
{
  "id": "123456789",
  "customer": "gid://shopify/Customer/9546466394443",
  "date": "2025-04-03",
  "type": "Anniversary",
  "occasion_name": "Our anniversary",
  "other_occasion": ""
}
```

### Delete

`POST /api/change-metaobject`

```json
{
  "operation": "delete",
  "id": "123456789",
  "customer": "gid://shopify/Customer/9546466394443"
}
```

`operation` must be `"delete"` or `"update"`.

---

## 3. IMPORTANT — the ID gotcha

`get-occasions` returns **full GIDs**:

```
gid://shopify/Metaobject/123456789
```

But `change-metaobject` (delete) expects the **bare numeric ID**. It prepends the GID
prefix itself, unconditionally — so passing a full GID produces
`gid://shopify/Metaobject/gid://shopify/Metaobject/123456789` and fails.

Always strip it before delete:

```js
const numericId = String(occasion.id).split("/").pop()
```

`create-metaobject` is more forgiving (it only prefixes when needed), but use the numeric
ID everywhere for consistency.

---

## 4. UI spec

### Form fields

| Field | Control | Required | Notes |
|---|---|---|---|
| `date` | date picker | yes | send as `YYYY-MM-DD` |
| `type` | dropdown | yes | list below |
| `other_occasion` | text | only if `type === "Other"` | hidden otherwise |
| `occasion_name` | text | yes | e.g. "Mum's birthday" |

**Validation:** submit stays disabled until all required fields are non-empty. When
`type` is `"Other"`, `other_occasion` becomes required. When the user switches away from
`"Other"`, clear the field and hide it.

**Occasion types** — fetch these at load time from:

```
POST /api/get-metaobject-definition
{ "type": "customer_event", "field": "type" }
```

Response:

```json
{
  "choices": ["Anniversary", "Dad's Birthday", "Easter", "Family Birthday",
              "Father's Day", "Friend's Birthday", "Mother's Day",
              "Mum's Birthday", "Other"],
  "choicesSource": "derived"
}
```

Populate the dropdown from `choices`, preserving the order returned (already
alphabetical). Keep the list above as a hardcoded fallback if the call fails, so the form
still works offline or on error.

`choicesSource` tells you where the list came from and needs no handling in the app — it
is `"derived"` today, meaning the values were collected from occasions customers have
already saved, and will switch to `"definition"` if we later add a formal choice list in
Shopify. See 6.1.

### List view

Show each saved occasion as a card with its name, formatted date, and type, plus Edit and
Delete actions. Include an "Add" button that opens the same form in create mode.

**Date display** — day + ordinal suffix + full month, no year. `2025-04-03` renders as
`3rd April`. Suffix rules: `1/21/31 → st`, `2/22 → nd`, `3/23 → rd`, everything else `th`.

**Sort order** — by next upcoming anniversary, not raw date. Compare month/day only,
ignoring year, so the soonest upcoming occasion appears first and ones already passed this
year roll to the end.

### Greeting message

Target is **3** occasions, worth **5** Pressie Points. Use `occasions.length` from
`get-occasions` as the count — do not read the customer's `no_occasions` metafield, which
can lag behind:

- `0` → `Hi {firstName}, add 3 occasion reminders and earn 5 Pressie Points.`
- `< 3` → `Hi {firstName}, add {3 - count} more occasion reminders and earn 5 Pressie Points.`
- `>= 3` → `Hi {firstName} congratulations, you have {count} occasion reminders set. Please update or add more reminders below to keep your preferences up to date.`

### Gift links

Each occasion card links to a shop collection. On web these are configurable per type in
the theme editor; for the app either hardcode a per-type map or default everything to
`/collections/biscuits`. Confirm with Matt which collections you should point at.

---

## 5. Reference implementation

`tapcart/OccasionsBlock.jsx` in this repo is a working React starting point covering all
four calls, the ID normalisation, the ordinal date formatting, and the sort order. It
loads the occasions and the type dropdown in parallel on mount, so it already picks up the
dynamic `choices` list described in section 4.

Two placeholders must be set at the top of the file before it will run:

```js
const API_BASE = "https://your-app.vercel.app"  // -> the base URL from section 1
const API_KEY  = ""                             // -> ask Matt for the key
```

It has not been run against a real Tapcart workspace, so treat it as a reference rather
than finished code. In particular, verify the shape of the customer object returned by
`useVariables()` in `getCustomerGid()` — that is the most likely thing to need adjusting.

---

## 6. Known issues

**6.1 — The type list is derived, not authoritative.** The `type` field is a plain text
field in Shopify with no formal choice list, so `get-metaobject-definition` returns the
distinct values already in use across saved occasions. Two consequences:

- A genuinely new type cannot appear in the dropdown until someone has saved one.
- Typos and one-offs will surface. `"Easter"` currently appears from a single record and
  may not be a real category — check with Matt before showing it prominently.

If we later add a proper choice list in Shopify, the endpoint returns that instead and
`choicesSource` flips to `"definition"`. No app change needed either way.

**6.2 — `type` values are not validated by Shopify.** Because the field is free text,
there is nothing stopping a mismatched value being written, and a typo becomes a new
dropdown entry for everyone. Always submit a value exactly as returned in `choices`,
apostrophes included — send `"Mum's Birthday"`, never `"mums birthday"`.

**6.3 — Some occasions are orphaned.** A handful of older `customer_event` records were
never added to their customer's `my_occasions` list, so `get-occasions` won't return them.
This is a known data issue on our side, not something to work around in the app.

**6.4 — The web version does a full page reload after save.** Don't copy that. Re-fetch
`get-occasions` and update state instead.

---

## Questions

Anything unclear about the endpoints or business rules, ask Matt.
