import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

type IncomingTrade = {
  ticket?: string | number
  deal?: string | number
  order?: string | number
  position?: string | number
  symbol?: string
  side?: string | number
  type?: string | number
  volume?: number | string
  lots?: number | string
  open_time?: string
  close_time?: string | null
  entry_price?: number | string | null
  exit_price?: number | string | null
  stop_loss?: number | string | null
  take_profit?: number | string | null
  pnl?: number | string | null
  profit?: number | string | null
  commission?: number | string | null
  swap?: number | string | null
  comment?: string | null
}

type IncomingPayload = {
  apiKey?: string
  api_key?: string
  mt5_login?: string | number
  broker?: string
  server?: string
  account?: {
    login?: string | number
    broker?: string
    server?: string
    currency?: string
    starting_balance?: number | string
    balance?: number | string
  }
  trade?: IncomingTrade
  trades?: IncomingTrade[]
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const parseNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const parseSide = (value: unknown): "long" | "short" => {
  if (typeof value === "number") return value === 1 ? "short" : "long"
  const lower = String(value ?? "").toLowerCase()
  if (lower.includes("sell") || lower === "short" || lower === "1") return "short"
  return "long"
}

const toSession = (openedAtIso: string): "asia" | "london" | "newyork" | "other" => {
  const hour = new Date(openedAtIso).getUTCHours()
  if (hour >= 0 && hour < 7) return "asia"
  if (hour >= 7 && hour < 13) return "london"
  if (hour >= 13 && hour < 21) return "newyork"
  return "other"
}

const normalizeTrade = (input: IncomingTrade) => {
  const openedAt = toIsoOrNull(input.open_time) ?? new Date().toISOString()
  const closedAt = toIsoOrNull(input.close_time ?? null)
  const netPnl = parseNumber(input.pnl) ?? parseNumber(input.profit) ?? 0
  const riskAmount = null

  const externalTradeIdRaw = input.ticket ?? input.deal ?? input.order
  const externalTradeId = externalTradeIdRaw === undefined || externalTradeIdRaw === null
    ? null
    : String(externalTradeIdRaw)

  return {
    symbol: String(input.symbol ?? "").trim().toUpperCase() || "UNKNOWN",
    side: parseSide(input.side ?? input.type),
    session: toSession(openedAt),
    status: closedAt ? "closed" : "open",
    opened_at: openedAt,
    closed_at: closedAt,
    entry_price: parseNumber(input.entry_price),
    exit_price: parseNumber(input.exit_price),
    stop_loss: parseNumber(input.stop_loss),
    take_profit: parseNumber(input.take_profit),
    risk_amount: riskAmount,
    position_size: parseNumber(input.volume) ?? parseNumber(input.lots),
    fees: parseNumber(input.commission) ?? 0,
    swap: parseNumber(input.swap) ?? 0,
    net_pnl: netPnl,
    r_multiple: null,
    confidence: null,
    plan_followed: true,
    note: input.comment?.trim() || null,
    external_source: "mt5",
    external_trade_id: externalTradeId,
    external_position_id:
      input.position === undefined || input.position === null ? null : String(input.position),
    external_order_id:
      input.order === undefined || input.order === null ? null : String(input.order),
    imported_at: new Date().toISOString(),
    custom_stats: {
      imported_via: "mt5-edge-function",
    },
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = (await req.json()) as IncomingPayload
    const apiKey = req.headers.get("x-api-key") ?? body.apiKey ?? body.api_key

    if (!apiKey || !apiKey.trim()) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { data: connection, error: connectionError } = await supabase
      .from("mt5_connections")
      .select("id,user_id,trading_account_id,sync_enabled,mt5_login,broker,server")
      .eq("api_key", apiKey.trim())
      .maybeSingle()

    if (connectionError) {
      return new Response(JSON.stringify({ error: connectionError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!connection || !connection.sync_enabled) {
      return new Response(JSON.stringify({ error: "Invalid or disabled API key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const mt5Login = String(body.account?.login ?? body.mt5_login ?? connection.mt5_login ?? "").trim()
    const broker = (body.account?.broker ?? body.broker ?? connection.broker ?? "Unknown broker").trim()
    const server = (body.account?.server ?? body.server ?? connection.server ?? "").trim()
    const currency = String(body.account?.currency ?? "USD").toUpperCase().slice(0, 8)

    let accountId = connection.trading_account_id

    if (!accountId) {
      const { data: createdAccount, error: createAccountError } = await supabase
        .from("trading_accounts")
        .insert({
          user_id: connection.user_id,
          name: mt5Login ? `MT5 ${mt5Login}` : "Main MT5",
          broker,
          platform: "mt5",
          account_currency: currency || "USD",
          starting_balance: parseNumber(body.account?.starting_balance) ?? parseNumber(body.account?.balance),
          is_active: true,
        })
        .select("id")
        .single()

      if (createAccountError || !createdAccount) {
        return new Response(JSON.stringify({ error: createAccountError?.message ?? "Failed to create account" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      accountId = createdAccount.id
    } else {
      await supabase
        .from("trading_accounts")
        .update({
          broker,
          account_currency: currency || undefined,
          starting_balance:
            parseNumber(body.account?.starting_balance) ?? parseNumber(body.account?.balance) ?? undefined,
        })
        .eq("id", accountId)
        .eq("user_id", connection.user_id)
    }

    await supabase
      .from("mt5_connections")
      .update({
        trading_account_id: accountId,
        mt5_login: mt5Login || null,
        broker: broker || null,
        server: server || null,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", connection.id)

    const incomingTrades = body.trade ? [body.trade] : Array.isArray(body.trades) ? body.trades : []

    if (incomingTrades.length === 0) {
      return new Response(JSON.stringify({ ok: true, imported: 0, message: "No trades in payload" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const normalized = incomingTrades.map(normalizeTrade)

    const importPayload = normalized.map((trade, index) => ({
      ...trade,
      external_trade_id: trade.external_trade_id ?? `fallback-${Date.now()}-${index}`,
      user_id: connection.user_id,
      account_id: accountId,
    }))

    const { data: upsertedTrades, error: upsertError } = await supabase
      .from("trades")
      .upsert(importPayload, {
        onConflict: "user_id,external_source,external_trade_id",
        ignoreDuplicates: false,
      })
      .select("id")

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        imported: upsertedTrades?.length ?? importPayload.length,
        account_id: accountId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
