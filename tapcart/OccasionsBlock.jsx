/**
 * Tapcart Custom Block — Occasions Manager
 * ------------------------------------------------------------------
 * Mobile-app equivalent of the Shopify theme block `combined-occasions-block.liquid`.
 *
 * It talks to the SAME Vercel-hosted API routes the theme page uses:
 *   POST /api/get-occasions              -> list this customer's occasions
 *   POST /api/get-metaobject-definition  -> dropdown choices for the "type" field
 *   POST /api/create-metaobject          -> create (or update, when `id` is sent)
 *   POST /api/change-metaobject          -> update / delete an existing occasion
 *
 * Nothing on the backend changes. This is purely a new client.
 *
 * ---- Tapcart integration notes -------------------------------------------------
 * - Custom Blocks receive helper hooks/props from the App Studio runtime. This file
 *   assumes `useVariables()` exposes the logged-in `customer`. Confirm the exact
 *   shape in your Tapcart workspace and adjust `getCustomerGid()` if needed.
 * - Tapcart renders to native, so Tailwind/theme CSS from the Liquid block does NOT
 *   carry over. UI here uses inline styles as a portable starting point — swap these
 *   for Tapcart's native component primitives where you want a fully native feel.
 * - Set NEXT_PUBLIC-style config below to your deployed Vercel URL.
 */

import { useCallback, useEffect, useMemo, useState } from "react"

// ---- Config -------------------------------------------------------------------
// Point this at your deployed Vercel app (no trailing slash).
const API_BASE = "https://your-app.vercel.app"

// Shared secret. Must match OCCASIONS_API_KEY set in the Vercel project env vars.
// The API routes now require this; requests without a matching key get a 401.
const API_KEY = ""

const OCCASION_TYPE_META = { type: "customer_event", field: "type" }

// ---- Helpers ------------------------------------------------------------------

/** Normalize whatever Tapcart gives us into `gid://shopify/Customer/<id>`. */
function getCustomerGid(customer) {
  if (!customer) return null
  const raw = customer.id ?? customer.customerId ?? customer.gid
  if (!raw) return null
  const str = String(raw)
  return str.startsWith("gid://") ? str : `gid://shopify/Customer/${str}`
}

/**
 * get-occasions returns full GIDs (gid://shopify/Metaobject/123), but
 * change-metaobject expects the NUMERIC id only (it re-adds the prefix itself).
 */
function toNumericMetaobjectId(id) {
  if (!id) return id
  const str = String(id)
  return str.includes("/") ? str.split("/").pop() : str
}

function apiHeaders() {
  const headers = { "Content-Type": "application/json" }
  if (API_KEY) headers["x-api-key"] = API_KEY
  return headers
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `Request to ${path} failed (${res.status})`)
  }
  return data
}

/** Ordinal date label matching the Liquid block, e.g. "3rd April". */
function formatOccasionDate(dateStr) {
  if (!dateStr) return ""
  const [year, month, day] = dateStr.split("-").map(Number)
  if (!year || !month || !day) return dateStr
  const d = new Date(year, month - 1, day)
  const dayNum = d.getDate()
  const monthName = d.toLocaleString("en-GB", { month: "long" })
  let suffix = "th"
  if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = "st"
  else if (dayNum === 2 || dayNum === 22) suffix = "nd"
  else if (dayNum === 3 || dayNum === 23) suffix = "rd"
  return `${dayNum}${suffix} ${monthName}`
}

/** Days until the next yearly anniversary of a date (used for sorting). */
function daysUntilNextAnniversary(dateStr) {
  if (!dateStr) return Number.MAX_SAFE_INTEGER
  const [, month, day] = dateStr.split("-").map(Number)
  if (!month || !day) return Number.MAX_SAFE_INTEGER
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = new Date(today.getFullYear(), month - 1, day)
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day)
  return Math.ceil((next - today) / (1000 * 60 * 60 * 24))
}

// ---- Component ----------------------------------------------------------------

export default function OccasionsBlock({ useVariables }) {
  const variables = typeof useVariables === "function" ? useVariables() : {}
  const customer = variables?.customer
  const customerGid = useMemo(() => getCustomerGid(customer), [customer])

  const [occasions, setOccasions] = useState([])
  const [typeChoices, setTypeChoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal + form state
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null) // numeric id when editing
  const [form, setForm] = useState({ occasion_name: "", type: "", date: "", other_occasion: "" })

  const loadOccasions = useCallback(async () => {
    if (!customerGid) return
    setError(null)
    try {
      const data = await postJson("/api/get-occasions", { customer: customerGid })
      const sorted = [...(data.occasions || [])].sort(
        (a, b) => daysUntilNextAnniversary(a.date) - daysUntilNextAnniversary(b.date),
      )
      setOccasions(sorted)
    } catch (err) {
      setError(err.message)
    }
  }, [customerGid])

  // Initial load: occasions + type dropdown choices, in parallel.
  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      const results = await Promise.allSettled([
        customerGid
          ? postJson("/api/get-occasions", { customer: customerGid })
          : Promise.resolve({ occasions: [] }),
        postJson("/api/get-metaobject-definition", OCCASION_TYPE_META),
      ])
      if (cancelled) return

      const [occRes, defRes] = results
      if (occRes.status === "fulfilled") {
        const sorted = [...(occRes.value.occasions || [])].sort(
          (a, b) => daysUntilNextAnniversary(a.date) - daysUntilNextAnniversary(b.date),
        )
        setOccasions(sorted)
      } else {
        setError(occRes.reason?.message || "Could not load occasions")
      }
      if (defRes.status === "fulfilled") {
        setTypeChoices(defRes.value.choices || [])
      }
      setLoading(false)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [customerGid])

  function openAdd() {
    setEditingId(null)
    setForm({ occasion_name: "", type: "", date: "", other_occasion: "" })
    setFormOpen(true)
  }

  function openEdit(occasion) {
    setEditingId(toNumericMetaobjectId(occasion.id))
    setForm({
      occasion_name: occasion.occasion_name || "",
      type: occasion.type || "",
      date: occasion.date || "",
      other_occasion: occasion.other_occasion || "",
    })
    setFormOpen(true)
  }

  async function handleSave() {
    if (!customerGid) return
    if (!form.occasion_name || !form.type || !form.date) {
      setError("Please fill in name, type and date.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        // Update existing occasion via change-metaobject (expects numeric id).
        await postJson("/api/change-metaobject", {
          id: editingId,
          customer: customerGid,
          operation: "update",
          date: form.date,
          type: form.type,
          occasion_name: form.occasion_name,
          other_occasion: form.other_occasion,
        })
      } else {
        // Create new occasion (also appends to my_occasions + bumps no_occasions).
        await postJson("/api/create-metaobject", {
          customer: customerGid,
          date: form.date,
          type: form.type,
          occasion_name: form.occasion_name,
          other_occasion: form.other_occasion,
        })
      }
      setFormOpen(false)
      await loadOccasions()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(occasion) {
    if (!customerGid) return
    setSaving(true)
    setError(null)
    try {
      await postJson("/api/change-metaobject", {
        id: toNumericMetaobjectId(occasion.id),
        customer: customerGid,
        operation: "delete",
      })
      setFormOpen(false)
      await loadOccasions()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- Render ------------------------------------------------------------------

  if (!customerGid) {
    return (
      <div style={styles.loginRequired}>
        <p style={styles.loginMessage}>Please log in to manage your occasions</p>
      </div>
    )
  }

  const target = 3 // mirrors block.settings.pressie_points_target default
  const points = 5 // mirrors block.settings.pressie_points_value default
  const count = occasions.length
  let greeting
  if (count === 0) {
    greeting = `Add ${target} occasion reminders and earn ${points} Pressie Points.`
  } else if (count < target) {
    greeting = `Add ${target - count} more occasion reminders and earn ${points} Pressie Points.`
  } else {
    greeting = `Congratulations, you have ${count} occasion reminders set. Update or add more below to keep your preferences up to date.`
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>My Occasions</h3>
      <p style={styles.greeting}>{greeting}</p>

      {error ? <p style={styles.error}>{error}</p> : null}

      {loading ? (
        <p style={styles.muted}>Loading your occasions…</p>
      ) : (
        <div style={styles.grid}>
          <button type="button" style={styles.addCard} onClick={openAdd}>
            + Add
          </button>

          {occasions.map((occasion) => (
            <div key={occasion.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h4 style={styles.occasionName}>{occasion.occasion_name}</h4>
                  <p style={styles.occasionDate}>{formatOccasionDate(occasion.date)}</p>
                  {occasion.type ? <p style={styles.occasionType}>{occasion.type}</p> : null}
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${occasion.occasion_name}`}
                  style={styles.editBtn}
                  onClick={() => openEdit(occasion)}
                >
                  {"\u22EF"}
                </button>
              </div>
            </div>
          ))}

          {count === 0 ? <p style={styles.muted}>No occasions found.</p> : null}
        </div>
      )}

      {formOpen ? (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true">
          <div style={styles.modal}>
            <h4 style={styles.modalTitle}>{editingId ? "Edit Occasion" : "Add Occasion Reminder"}</h4>

            <label style={styles.label}>
              Occasion name
              <input
                style={styles.input}
                value={form.occasion_name}
                onChange={(e) => setForm((f) => ({ ...f, occasion_name: e.target.value }))}
              />
            </label>

            <label style={styles.label}>
              Type
              <select
                style={styles.input}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="">Select a type…</option>
                {typeChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Date
              <input
                type="date"
                style={styles.input}
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>

            <div style={styles.modalActions}>
              <button type="button" style={styles.secondaryBtn} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </button>
              {editingId ? (
                <button
                  type="button"
                  style={styles.dangerBtn}
                  onClick={() => handleDelete({ id: editingId })}
                  disabled={saving}
                >
                  Delete
                </button>
              ) : null}
              <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---- Inline styles (portable starting point; swap for Tapcart native primitives) ----
const styles = {
  container: { maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: 16 },
  heading: { margin: "0 0 4px", fontSize: 20, fontWeight: 600 },
  greeting: { margin: "0 0 16px", fontSize: 15, color: "#444" },
  error: { color: "#b00020", fontSize: 14, margin: "0 0 12px" },
  muted: { color: "#666", fontSize: 15 },
  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 16 },
  addCard: {
    minHeight: 120,
    border: "1px solid #ddd",
    borderRadius: 12,
    background: "#fff",
    fontSize: 16,
    cursor: "pointer",
  },
  card: {
    minHeight: 120,
    border: "1px solid #ddd",
    borderRadius: 12,
    background: "#fff",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  occasionName: { margin: 0, fontSize: 18, fontWeight: 600 },
  occasionDate: { margin: "4px 0 0", fontSize: 15, color: "#666" },
  occasionType: { margin: "4px 0 0", fontSize: 12, color: "#888" },
  editBtn: { background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: { background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 420 },
  modalTitle: { margin: "0 0 16px", fontSize: 18, fontWeight: 600 },
  label: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, fontSize: 14, color: "#444" },
  input: { padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, fontSize: 15 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  primaryBtn: {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 16px",
    border: "1px solid #ccc",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "10px 16px",
    border: "1px solid #b00020",
    borderRadius: 8,
    background: "#fff",
    color: "#b00020",
    cursor: "pointer",
  },
  loginRequired: { textAlign: "center", padding: "40px 20px", maxWidth: 400, margin: "0 auto" },
  loginMessage: { margin: "0 0 24px", fontSize: 16, fontWeight: 500 },
}
