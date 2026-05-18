import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from './supabaseClient'

type TradingAccount = {
  id: string
  name: string
  broker: string | null
  account_currency: string
}

type Setup = {
  id: string
  name: string
}

type Tag = {
  id: string
  name: string
  color: string | null
}

type Trade = {
  id: string
  symbol: string
  side: 'long' | 'short'
  session: 'asia' | 'london' | 'newyork' | 'other'
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  take_profit: number | null
  risk_amount: number | null
  position_size: number | null
  fees: number
  swap: number
  net_pnl: number
  r_multiple: number | null
  confidence: number | null
  plan_followed: boolean
  entry_comment: string | null
  management_comment: string | null
  exit_comment: string | null
  entry_rating: -1 | 0 | 1
  management_rating: -1 | 0 | 1
  exit_rating: -1 | 0 | 1
  custom_stats: Record<string, string>
  note: string | null
  account_id: string | null
  setup_id: string | null
  trading_accounts: { name: string; account_currency: string } | null
  setups: { name: string } | null
}

type TradeTagLink = {
  trade_id: string
  tags: { name: string; color: string | null } | null
}

type RawTrade = Record<string, unknown>

type TradeForm = {
  accountId: string
  setupId: string
  symbol: string
  side: 'long' | 'short'
  session: 'asia' | 'london' | 'newyork' | 'other'
  openedAt: string
  closedAt: string
  entryPrice: string
  exitPrice: string
  stopLoss: string
  takeProfit: string
  riskAmount: string
  positionSize: string
  fees: string
  swap: string
  netPnl: string
  confidence: string
  planFollowed: boolean
  entryComment: string
  managementComment: string
  exitComment: string
  entryRating: '-1' | '0' | '1'
  managementRating: '-1' | '0' | '1'
  exitRating: '-1' | '0' | '1'
  marketCondition: string
  emotion: string
  note: string
  tagsCsv: string
}

const createDefaultTradeForm = (accountId = '', setupId = ''): TradeForm => ({
  accountId,
  setupId,
  symbol: '',
  side: 'long',
  session: 'london',
  openedAt: new Date().toISOString().slice(0, 16),
  closedAt: new Date().toISOString().slice(0, 16),
  entryPrice: '',
  exitPrice: '',
  stopLoss: '',
  takeProfit: '',
  riskAmount: '',
  positionSize: '',
  fees: '0',
  swap: '0',
  netPnl: '',
  confidence: '',
  planFollowed: true,
  entryComment: '',
  managementComment: '',
  exitComment: '',
  entryRating: '0',
  managementRating: '0',
  exitRating: '0',
  marketCondition: '',
  emotion: '',
  note: '',
  tagsCsv: '',
})

const asNumberOrNull = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)

const formatPercent = (value: number) => `${value.toFixed(2)}%`

const dayKeyFromIso = (iso: string) => iso.slice(0, 10)

const getRequiredRForPositiveExpectancy = (winratePercent: number) => {
  const w = winratePercent / 100
  if (w <= 0) return Number.POSITIVE_INFINITY
  if (w >= 1) return 0
  return (1 - w) / w
}

const getPlannedR = (trade: Trade) => {
  if (
    trade.entry_price === null ||
    trade.stop_loss === null ||
    trade.take_profit === null ||
    trade.entry_price === trade.stop_loss
  ) {
    return null
  }

  const risk =
    trade.side === 'long'
      ? trade.entry_price - trade.stop_loss
      : trade.stop_loss - trade.entry_price
  const reward =
    trade.side === 'long'
      ? trade.take_profit - trade.entry_price
      : trade.entry_price - trade.take_profit

  if (risk <= 0) return null
  return reward / risk
}

const getRealizedR = (trade: Trade) => trade.r_multiple

const getTiltScore = (trade: Trade) => {
  const ratings: number[] = [trade.entry_rating, trade.management_rating, trade.exit_rating]
  const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
  return Math.round(((avg + 1) / 2) * 100)
}

const normalizeTrade = (row: RawTrade): Trade => {
  const accountRel = Array.isArray(row.trading_accounts)
    ? (row.trading_accounts[0] as { name: string; account_currency: string } | undefined) ?? null
    : ((row.trading_accounts as { name: string; account_currency: string } | null) ?? null)

  const setupRel = Array.isArray(row.setups)
    ? (row.setups[0] as { name: string } | undefined) ?? null
    : ((row.setups as { name: string } | null) ?? null)

  return {
    id: String(row.id),
    symbol: String(row.symbol),
    side: row.side === 'short' ? 'short' : 'long',
    session:
      row.session === 'asia' || row.session === 'london' || row.session === 'newyork'
        ? row.session
        : 'other',
    status: row.status === 'open' ? 'open' : 'closed',
    opened_at: String(row.opened_at),
    closed_at: row.closed_at ? String(row.closed_at) : null,
    entry_price: row.entry_price === null ? null : Number(row.entry_price),
    exit_price: row.exit_price === null ? null : Number(row.exit_price),
    stop_loss: row.stop_loss === null ? null : Number(row.stop_loss),
    take_profit: row.take_profit === null ? null : Number(row.take_profit),
    risk_amount: row.risk_amount === null ? null : Number(row.risk_amount),
    position_size: row.position_size === null ? null : Number(row.position_size),
    fees: row.fees === null ? 0 : Number(row.fees),
    swap: row.swap === null ? 0 : Number(row.swap),
    net_pnl: Number(row.net_pnl ?? 0),
    r_multiple: row.r_multiple === null ? null : Number(row.r_multiple),
    confidence: row.confidence === null ? null : Number(row.confidence),
    plan_followed: row.plan_followed === null ? true : Boolean(row.plan_followed),
    entry_comment: row.entry_comment ? String(row.entry_comment) : null,
    management_comment: row.management_comment ? String(row.management_comment) : null,
    exit_comment: row.exit_comment ? String(row.exit_comment) : null,
    entry_rating:
      Number(row.entry_rating) === -1 || Number(row.entry_rating) === 1
        ? (Number(row.entry_rating) as -1 | 1)
        : 0,
    management_rating:
      Number(row.management_rating) === -1 || Number(row.management_rating) === 1
        ? (Number(row.management_rating) as -1 | 1)
        : 0,
    exit_rating:
      Number(row.exit_rating) === -1 || Number(row.exit_rating) === 1
        ? (Number(row.exit_rating) as -1 | 1)
        : 0,
    custom_stats:
      row.custom_stats && typeof row.custom_stats === 'object'
        ? (row.custom_stats as Record<string, string>)
        : {},
    note: row.note ? String(row.note) : null,
    account_id: row.account_id ? String(row.account_id) : null,
    setup_id: row.setup_id ? String(row.setup_id) : null,
    trading_accounts: accountRel,
    setups: setupRel,
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(Boolean(supabase))
  const [sendingLink, setSendingLink] = useState(false)
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(supabaseConfigError ?? '')

  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [tradeTags, setTradeTags] = useState<Record<string, string[]>>({})

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  })

  const [symbolFilter, setSymbolFilter] = useState('')
  const [setupFilter, setSetupFilter] = useState('all')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState<'all' | 'followed' | 'broken'>('all')
  const [minConfidenceFilter, setMinConfidenceFilter] = useState('')
  const [emotionFilter, setEmotionFilter] = useState('all')
  const [marketConditionFilter, setMarketConditionFilter] = useState('all')

  const [newAccountName, setNewAccountName] = useState('')
  const [newSetupName, setNewSetupName] = useState('')

  const [form, setForm] = useState<TradeForm>(createDefaultTradeForm())

  useEffect(() => {
    const client = supabase
    if (!client) return

    const bootstrap = async () => {
      const { data, error: sessionError } = await client.auth.getSession()
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setBooting(false)
    }

    bootstrap()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !session) return

    const loadWorkspace = async () => {
      setLoadingData(true)
      setError('')

      const fetchAll = async () => {
        const [accountsResult, setupsResult, tagsResult, tradesResult, tradeTagsResult] = await Promise.all([
          client
            .from('trading_accounts')
            .select('id, name, broker, account_currency')
            .order('created_at', { ascending: true }),
          client.from('setups').select('id, name').order('created_at', { ascending: true }),
          client.from('tags').select('id, name, color').order('name', { ascending: true }),
          client
            .from('trades')
            .select(
              'id, symbol, side, session, status, opened_at, closed_at, entry_price, exit_price, stop_loss, take_profit, risk_amount, position_size, fees, swap, net_pnl, r_multiple, confidence, plan_followed, entry_comment, management_comment, exit_comment, entry_rating, management_rating, exit_rating, custom_stats, note, account_id, setup_id, trading_accounts(name, account_currency), setups(name)',
            )
            .order('opened_at', { ascending: false }),
          client.from('trade_tags').select('trade_id, tags(name, color)'),
        ])

        return {
          accountsResult,
          setupsResult,
          tagsResult,
          tradesResult,
          tradeTagsResult,
        }
      }

      const firstPass = await fetchAll()

      const firstErrors = [
        firstPass.accountsResult.error,
        firstPass.setupsResult.error,
        firstPass.tagsResult.error,
        firstPass.tradesResult.error,
        firstPass.tradeTagsResult.error,
      ].filter(Boolean)

      if (firstErrors.length > 0) {
        setError(firstErrors[0]?.message ?? 'Failed to load workspace data.')
        setLoadingData(false)
        return
      }

      if ((firstPass.accountsResult.data ?? []).length === 0) {
        await client.from('trading_accounts').insert({
          name: 'Main MT5',
          broker: 'Unknown broker',
          platform: 'mt5',
          account_currency: 'USD',
        })
      }

      if ((firstPass.setupsResult.data ?? []).length === 0) {
        await client.from('setups').insert([
          { name: 'Breakout' },
          { name: 'Pullback' },
          { name: 'Reversal' },
          { name: 'News fade' },
        ])
      }

      const secondPass = await fetchAll()

      const secondErrors = [
        secondPass.accountsResult.error,
        secondPass.setupsResult.error,
        secondPass.tagsResult.error,
        secondPass.tradesResult.error,
        secondPass.tradeTagsResult.error,
      ].filter(Boolean)

      if (secondErrors.length > 0) {
        setError(secondErrors[0]?.message ?? 'Failed to refresh workspace data.')
        setLoadingData(false)
        return
      }

      const loadedAccounts = (secondPass.accountsResult.data ?? []) as TradingAccount[]
      const loadedSetups = (secondPass.setupsResult.data ?? []) as Setup[]
      const loadedTags = (secondPass.tagsResult.data ?? []) as Tag[]
      const loadedTrades = ((secondPass.tradesResult.data ?? []) as RawTrade[]).map(normalizeTrade)
      const loadedTradeTagRows = (secondPass.tradeTagsResult.data ?? []) as unknown as TradeTagLink[]

      const tagMap: Record<string, string[]> = {}
      for (const row of loadedTradeTagRows) {
        if (!tagMap[row.trade_id]) tagMap[row.trade_id] = []
        if (row.tags?.name) tagMap[row.trade_id].push(row.tags.name)
      }

      setAccounts(loadedAccounts)
      setSetups(loadedSetups)
      setTags(loadedTags)
      setTrades(loadedTrades)
      setTradeTags(tagMap)

      setForm((prev) => {
        const accountId = prev.accountId || loadedAccounts[0]?.id || ''
        const setupId = prev.setupId || loadedSetups[0]?.id || ''
        return { ...prev, accountId, setupId }
      })

      setLoadingData(false)
    }

    loadWorkspace()
  }, [session])

  const emotionOptions = useMemo(() => {
    const values = new Set<string>()
    trades.forEach((trade) => {
      const v = trade.custom_stats.emotion?.trim()
      if (v) values.add(v)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [trades])

  const marketConditionOptions = useMemo(() => {
    const values = new Set<string>()
    trades.forEach((trade) => {
      const v = trade.custom_stats.market_condition?.trim()
      if (v) values.add(v)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [trades])

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const symbolOk = !symbolFilter || trade.symbol.toLowerCase().includes(symbolFilter.toLowerCase())
      const setupOk = setupFilter === 'all' || trade.setup_id === setupFilter
      const sessionOk = sessionFilter === 'all' || trade.session === sessionFilter
      const tagOk = tagFilter === 'all' || (tradeTags[trade.id] ?? []).includes(tagFilter)
      const planOk =
        planFilter === 'all' ||
        (planFilter === 'followed' && trade.plan_followed) ||
        (planFilter === 'broken' && !trade.plan_followed)
      const confidenceMin = minConfidenceFilter ? Number(minConfidenceFilter) : null
      const confidenceOk =
        confidenceMin === null || (trade.confidence !== null && trade.confidence >= confidenceMin)
      const emotionOk =
        emotionFilter === 'all' || (trade.custom_stats.emotion ?? '') === emotionFilter
      const marketConditionOk =
        marketConditionFilter === 'all' ||
        (trade.custom_stats.market_condition ?? '') === marketConditionFilter

      return (
        symbolOk &&
        setupOk &&
        sessionOk &&
        tagOk &&
        planOk &&
        confidenceOk &&
        emotionOk &&
        marketConditionOk
      )
    })
  }, [
    trades,
    symbolFilter,
    setupFilter,
    sessionFilter,
    tagFilter,
    planFilter,
    minConfidenceFilter,
    emotionFilter,
    marketConditionFilter,
    tradeTags,
  ])

  const tradeMetrics = useMemo(() => {
    const closedTrades = filteredTrades.filter((trade) => trade.status !== 'open')
    const totalTrades = closedTrades.length
    const netReturn = closedTrades.reduce((sum, trade) => sum + trade.net_pnl, 0)
    const wins = closedTrades.filter((trade) => trade.net_pnl > 0)
    const losses = closedTrades.filter((trade) => trade.net_pnl < 0)
    const winrate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0
    const avgPnl = totalTrades > 0 ? netReturn / totalTrades : 0
    const expectancy = avgPnl

    const grossProfit = wins.reduce((sum, trade) => sum + trade.net_pnl, 0)
    const grossLossAbs = Math.abs(losses.reduce((sum, trade) => sum + trade.net_pnl, 0))
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? 999 : 0

    const rTrades = closedTrades.filter((trade) => trade.r_multiple !== null)
    const avgR = rTrades.length > 0 ? rTrades.reduce((sum, trade) => sum + (trade.r_multiple ?? 0), 0) / rTrades.length : 0

    const totalFees = closedTrades.reduce((sum, trade) => sum + (trade.fees ?? 0), 0)

    const dayMap = new Map<string, number>()
    for (const trade of closedTrades) {
      const day = dayKeyFromIso(trade.closed_at ?? trade.opened_at)
      dayMap.set(day, (dayMap.get(day) ?? 0) + trade.net_pnl)
    }

    const dayPnls = Array.from(dayMap.values())
    const avgProfitPerDay = dayPnls.length > 0 ? dayPnls.reduce((a, b) => a + b, 0) / dayPnls.length : 0
    const winningDays = dayPnls.filter((pnl) => pnl > 0).length
    const losingDays = dayPnls.filter((pnl) => pnl < 0).length

    const biggestWinner = wins.length > 0 ? Math.max(...wins.map((trade) => trade.net_pnl)) : 0
    const biggestLoser = losses.length > 0 ? Math.min(...losses.map((trade) => trade.net_pnl)) : 0

    const holdHours = closedTrades
      .map((trade) => {
        const open = new Date(trade.opened_at).getTime()
        const close = new Date(trade.closed_at ?? trade.opened_at).getTime()
        return Math.max(0, close - open) / (1000 * 60 * 60)
      })
      .filter((hours) => Number.isFinite(hours))

    const avgHoldHours =
      holdHours.length > 0 ? holdHours.reduce((sum, hours) => sum + hours, 0) / holdHours.length : 0

    return {
      totalTrades,
      netReturn,
      winrate,
      avgPnl,
      expectancy,
      profitFactor,
      avgR,
      totalFees,
      avgProfitPerDay,
      winningDays,
      losingDays,
      biggestWinner,
      biggestLoser,
      avgHoldHours,
      dayMap,
    }
  }, [filteredTrades])

  const calendarCells = useMemo(() => {
    const year = selectedMonth.getUTCFullYear()
    const month = selectedMonth.getUTCMonth()

    const first = new Date(Date.UTC(year, month, 1))
    const startDay = (first.getUTCDay() + 6) % 7
    const startDate = new Date(Date.UTC(year, month, 1 - startDay))

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(startDate)
      date.setUTCDate(startDate.getUTCDate() + i)
      const key = date.toISOString().slice(0, 10)
      const pnl = tradeMetrics.dayMap.get(key) ?? 0
      const count = filteredTrades.filter((trade) => dayKeyFromIso(trade.closed_at ?? trade.opened_at) === key).length
      return {
        key,
        date,
        isCurrentMonth: date.getUTCMonth() === month,
        pnl,
        count,
      }
    })
  }, [selectedMonth, tradeMetrics.dayMap, filteredTrades])

  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setSendingLink(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}${window.location.pathname}`

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (authError) {
      setError(authError.message)
    } else {
      setMessage('Magic link verstuurd. Check je inbox.')
    }

    setSendingLink(false)
  }

  const signOut = async () => {
    if (!supabase) return
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  const createAccount = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !newAccountName.trim()) return

    const { data, error: insertError } = await supabase
      .from('trading_accounts')
      .insert({ name: newAccountName.trim(), account_currency: 'USD', platform: 'mt5' })
      .select('id, name, broker, account_currency')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setAccounts((prev) => [...prev, data as TradingAccount])
    setNewAccountName('')
    setForm((prev) => ({ ...prev, accountId: data.id }))
  }

  const createSetup = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !newSetupName.trim()) return

    const { data, error: insertError } = await supabase
      .from('setups')
      .insert({ name: newSetupName.trim() })
      .select('id, name')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSetups((prev) => [...prev, data as Setup])
    setNewSetupName('')
    setForm((prev) => ({ ...prev, setupId: data.id }))
  }

  const createTrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return

    const symbol = form.symbol.trim().toUpperCase()
    if (!symbol) {
      setError('Symbol is verplicht.')
      return
    }

    const netPnl = asNumberOrNull(form.netPnl)
    if (netPnl === null) {
      setError('Net PnL is verplicht en moet numeriek zijn.')
      return
    }

    setSubmittingTrade(true)
    setError('')

    const riskAmount = asNumberOrNull(form.riskAmount)
    const rMultiple = riskAmount && riskAmount !== 0 ? netPnl / riskAmount : null

    const payload = {
      account_id: form.accountId || null,
      setup_id: form.setupId || null,
      symbol,
      side: form.side,
      session: form.session,
      status: 'closed',
      opened_at: new Date(form.openedAt).toISOString(),
      closed_at: form.closedAt ? new Date(form.closedAt).toISOString() : null,
      entry_price: asNumberOrNull(form.entryPrice),
      exit_price: asNumberOrNull(form.exitPrice),
      stop_loss: asNumberOrNull(form.stopLoss),
      take_profit: asNumberOrNull(form.takeProfit),
      risk_amount: riskAmount,
      position_size: asNumberOrNull(form.positionSize),
      fees: asNumberOrNull(form.fees) ?? 0,
      swap: asNumberOrNull(form.swap) ?? 0,
      net_pnl: netPnl,
      r_multiple: rMultiple,
      confidence: asNumberOrNull(form.confidence),
      plan_followed: form.planFollowed,
      entry_comment: form.entryComment.trim() || null,
      management_comment: form.managementComment.trim() || null,
      exit_comment: form.exitComment.trim() || null,
      entry_rating: Number(form.entryRating),
      management_rating: Number(form.managementRating),
      exit_rating: Number(form.exitRating),
      custom_stats: {
        market_condition: form.marketCondition.trim(),
        emotion: form.emotion.trim(),
      },
      note: form.note.trim() || null,
    }

    const { data: createdTrade, error: insertError } = await supabase
      .from('trades')
      .insert(payload)
      .select(
        'id, symbol, side, session, status, opened_at, closed_at, entry_price, exit_price, stop_loss, take_profit, risk_amount, position_size, fees, swap, net_pnl, r_multiple, confidence, plan_followed, entry_comment, management_comment, exit_comment, entry_rating, management_rating, exit_rating, custom_stats, note, account_id, setup_id, trading_accounts(name, account_currency), setups(name)',
      )
      .single()

    if (insertError || !createdTrade) {
      setError(insertError?.message ?? 'Failed to create trade.')
      setSubmittingTrade(false)
      return
    }

    const requestedTags = form.tagsCsv
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (requestedTags.length > 0) {
      const { data: upsertedTags, error: tagUpsertError } = await supabase
        .from('tags')
        .upsert(
          requestedTags.map((name) => ({ name })),
          { onConflict: 'user_id,name' },
        )
        .select('id, name, color')

      if (!tagUpsertError && upsertedTags) {
        const uniqueTags = upsertedTags as Tag[]
        setTags((prev) => {
          const map = new Map(prev.map((tag) => [tag.id, tag]))
          for (const t of uniqueTags) map.set(t.id, t)
          return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
        })

        const linkPayload = uniqueTags.map((tag) => ({ trade_id: createdTrade.id, tag_id: tag.id }))
        await supabase.from('trade_tags').upsert(linkPayload, { onConflict: 'trade_id,tag_id' })
        setTradeTags((prev) => ({
          ...prev,
          [createdTrade.id]: uniqueTags.map((tag) => tag.name),
        }))
      }
    }

    setTrades((prev) => [normalizeTrade(createdTrade as unknown as RawTrade), ...prev])

    setForm(createDefaultTradeForm(form.accountId || accounts[0]?.id || '', form.setupId || setups[0]?.id || ''))
    setSubmittingTrade(false)
  }

  if (!supabase) {
    return (
      <main className="shell">
        <section className="card auth-card">
          <h1>TradeOS</h1>
          <p className="err">{supabaseConfigError}</p>
        </section>
      </main>
    )
  }

  if (booting) {
    return (
      <main className="shell">
        <p>TradeOS opstarten...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="shell">
        <section className="card auth-card">
          <h1>TradeOS</h1>
          <p>Login met magic link zodat jij veilig je trading data kan tracken.</p>
          <form onSubmit={sendMagicLink} className="stack">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jij@domein.com"
              required
            />
            <button type="submit" disabled={sendingLink}>
              {sendingLink ? 'Versturen...' : 'Stuur magic link'}
            </button>
          </form>
          {message && <p className="ok">{message}</p>}
          {error && <p className="err">{error}</p>}
        </section>
      </main>
    )
  }

  const monthTitle = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const requiredR = getRequiredRForPositiveExpectancy(tradeMetrics.winrate)
  const pcpActive = tradeMetrics.totalTrades >= 30 && Number.isFinite(requiredR)

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">TradeOS</div>
        <nav>
          <button className="nav-item active">Dashboard</button>
          <button className="nav-item">Trading Journal</button>
          <button className="nav-item">Trade Analytics</button>
          <button className="nav-item">Reports</button>
        </nav>
        <div className="sidebar-footer">
          <p>{session.user.email}</p>
          <button onClick={signOut}>Uitloggen</button>
        </div>
      </aside>

      <section className="content">
        <header className="toolbar card">
          <div className="toolbar-left">
            <h1>Performance Dashboard</h1>
            <p>Edgewonk-style evaluatie op je eigen trading data.</p>
          </div>
          <div className="toolbar-right filters-stack">
            <div className="filters-grid basic-filters">
              <input
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                placeholder="Filter symbol (EURUSD, XAUUSD...)"
              />
              <select value={setupFilter} onChange={(e) => setSetupFilter(e.target.value)}>
                <option value="all">Alle setups</option>
                {setups.map((setup) => (
                  <option key={setup.id} value={setup.id}>
                    {setup.name}
                  </option>
                ))}
              </select>
              <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
                <option value="all">Alle sessies</option>
                <option value="asia">Asia</option>
                <option value="london">London</option>
                <option value="newyork">New York</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="filters-grid advanced-filters">
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="all">Alle tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value as 'all' | 'followed' | 'broken')}
              >
                <option value="all">Plan all</option>
                <option value="followed">Plan gevolgd</option>
                <option value="broken">Plan gebroken</option>
              </select>
              <input
                value={minConfidenceFilter}
                onChange={(e) => setMinConfidenceFilter(e.target.value)}
                placeholder="Min confidence"
              />
              <select value={emotionFilter} onChange={(e) => setEmotionFilter(e.target.value)}>
                <option value="all">Emotion all</option>
                {emotionOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={marketConditionFilter}
                onChange={(e) => setMarketConditionFilter(e.target.value)}
              >
                <option value="all">Market all</option>
                {marketConditionOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <section className="kpi-grid">
          <article className="kpi card">
            <p>Net Return</p>
            <h3>{formatCurrency(tradeMetrics.netReturn)}</h3>
          </article>
          <article className="kpi card">
            <p>Winrate</p>
            <h3>{formatPercent(tradeMetrics.winrate)}</h3>
          </article>
          <article className="kpi card">
            <p>Expectancy</p>
            <h3>{formatCurrency(tradeMetrics.expectancy)}</h3>
          </article>
          <article className="kpi card">
            <p>Profit Factor</p>
            <h3>{tradeMetrics.profitFactor.toFixed(2)}</h3>
          </article>
          <article className="kpi card">
            <p>Avg R Multiple</p>
            <h3>{tradeMetrics.avgR.toFixed(2)}R</h3>
          </article>
        </section>

        <section className="workspace-row">
          <article className="card workspace-card">
            <h2>Workspace Setup</h2>
            <div className="mini-row">
              <form onSubmit={createAccount} className="inline-form">
                <input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Nieuw account (bv. FTMO 100k)"
                />
                <button type="submit">Add account</button>
              </form>
              <form onSubmit={createSetup} className="inline-form">
                <input
                  value={newSetupName}
                  onChange={(e) => setNewSetupName(e.target.value)}
                  placeholder="Nieuwe setup"
                />
                <button type="submit">Add setup</button>
              </form>
            </div>
            <p className="muted">
              Accounts: {accounts.length} | Setups: {setups.length} | Tags: {tags.length}
            </p>
          </article>
        </section>

        <section className="main-grid">
          <article className="card trade-form-card">
            <h2>Nieuwe Trade</h2>
            <form onSubmit={createTrade} className="trade-form">
              <div className="two-col">
                <select
                  value={form.accountId}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value }))}
                >
                  <option value="">Geen account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>

                <select
                  value={form.setupId}
                  onChange={(e) => setForm((prev) => ({ ...prev, setupId: e.target.value }))}
                >
                  <option value="">Geen setup</option>
                  {setups.map((setup) => (
                    <option key={setup.id} value={setup.id}>
                      {setup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="two-col">
                <input
                  value={form.symbol}
                  onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))}
                  placeholder="Symbol (EURUSD, XAUUSD)"
                  required
                />
                <select
                  value={form.side}
                  onChange={(e) => setForm((prev) => ({ ...prev, side: e.target.value as 'long' | 'short' }))}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>

              <div className="two-col">
                <select
                  value={form.session}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      session: e.target.value as 'asia' | 'london' | 'newyork' | 'other',
                    }))
                  }
                >
                  <option value="asia">Asia</option>
                  <option value="london">London</option>
                  <option value="newyork">New York</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={form.confidence}
                  onChange={(e) => setForm((prev) => ({ ...prev, confidence: e.target.value }))}
                  placeholder="Confidence 1-100"
                />
              </div>

              <div className="two-col">
                <input
                  type="datetime-local"
                  value={form.openedAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, openedAt: e.target.value }))}
                />
                <input
                  type="datetime-local"
                  value={form.closedAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, closedAt: e.target.value }))}
                />
              </div>

              <div className="four-col">
                <input
                  value={form.entryPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, entryPrice: e.target.value }))}
                  placeholder="Entry"
                />
                <input
                  value={form.exitPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, exitPrice: e.target.value }))}
                  placeholder="Exit"
                />
                <input
                  value={form.stopLoss}
                  onChange={(e) => setForm((prev) => ({ ...prev, stopLoss: e.target.value }))}
                  placeholder="SL"
                />
                <input
                  value={form.takeProfit}
                  onChange={(e) => setForm((prev) => ({ ...prev, takeProfit: e.target.value }))}
                  placeholder="TP"
                />
              </div>

              <div className="four-col">
                <input
                  value={form.riskAmount}
                  onChange={(e) => setForm((prev) => ({ ...prev, riskAmount: e.target.value }))}
                  placeholder="Risk $"
                />
                <input
                  value={form.positionSize}
                  onChange={(e) => setForm((prev) => ({ ...prev, positionSize: e.target.value }))}
                  placeholder="Position size"
                />
                <input
                  value={form.fees}
                  onChange={(e) => setForm((prev) => ({ ...prev, fees: e.target.value }))}
                  placeholder="Fees"
                />
                <input
                  value={form.swap}
                  onChange={(e) => setForm((prev) => ({ ...prev, swap: e.target.value }))}
                  placeholder="Swap"
                />
              </div>

              <input
                value={form.netPnl}
                onChange={(e) => setForm((prev) => ({ ...prev, netPnl: e.target.value }))}
                placeholder="Net PnL (verplicht, bv. 184.55 of -79.10)"
                required
              />

              <input
                value={form.tagsCsv}
                onChange={(e) => setForm((prev) => ({ ...prev, tagsCsv: e.target.value }))}
                placeholder="Tags (comma separated): A+, news, overtrade"
              />

              <div className="two-col">
                <input
                  value={form.marketCondition}
                  onChange={(e) => setForm((prev) => ({ ...prev, marketCondition: e.target.value }))}
                  placeholder="Custom stat: market_condition"
                />
                <input
                  value={form.emotion}
                  onChange={(e) => setForm((prev) => ({ ...prev, emotion: e.target.value }))}
                  placeholder="Custom stat: emotion"
                />
              </div>

              <div className="three-col">
                <select
                  value={form.entryRating}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, entryRating: e.target.value as '-1' | '0' | '1' }))
                  }
                >
                  <option value="-1">Entry rating: negative</option>
                  <option value="0">Entry rating: neutral</option>
                  <option value="1">Entry rating: positive</option>
                </select>
                <select
                  value={form.managementRating}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      managementRating: e.target.value as '-1' | '0' | '1',
                    }))
                  }
                >
                  <option value="-1">Mgmt rating: negative</option>
                  <option value="0">Mgmt rating: neutral</option>
                  <option value="1">Mgmt rating: positive</option>
                </select>
                <select
                  value={form.exitRating}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, exitRating: e.target.value as '-1' | '0' | '1' }))
                  }
                >
                  <option value="-1">Exit rating: negative</option>
                  <option value="0">Exit rating: neutral</option>
                  <option value="1">Exit rating: positive</option>
                </select>
              </div>

              <textarea
                value={form.entryComment}
                onChange={(e) => setForm((prev) => ({ ...prev, entryComment: e.target.value }))}
                rows={2}
                placeholder="Entry comment"
              />
              <textarea
                value={form.managementComment}
                onChange={(e) => setForm((prev) => ({ ...prev, managementComment: e.target.value }))}
                rows={2}
                placeholder="Management comment"
              />
              <textarea
                value={form.exitComment}
                onChange={(e) => setForm((prev) => ({ ...prev, exitComment: e.target.value }))}
                rows={2}
                placeholder="Exit comment"
              />

              <textarea
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                rows={4}
                placeholder="Trade note / psychologie / execution review"
              />

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.planFollowed}
                  onChange={(e) => setForm((prev) => ({ ...prev, planFollowed: e.target.checked }))}
                />
                Plan gevolgd
              </label>

              <button type="submit" disabled={submittingTrade || loadingData}>
                {submittingTrade ? 'Trade opslaan...' : 'Trade opslaan'}
              </button>
            </form>
          </article>

          <article className="card calendar-card">
            <div className="calendar-header">
              <h2>Profit Calendar</h2>
              <div className="calendar-controls">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth(
                      (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)),
                    )
                  }
                >
                  ←
                </button>
                <strong>{monthTitle}</strong>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth(
                      (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)),
                    )
                  }
                >
                  →
                </button>
              </div>
            </div>

            <div className="calendar-grid labels">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                <div key={label} className="calendar-label">
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarCells.map((cell) => {
                const day = cell.date.getUTCDate()
                const pnlClass = cell.pnl > 0 ? 'profit' : cell.pnl < 0 ? 'loss' : 'flat'
                return (
                  <div key={cell.key} className={`calendar-cell ${cell.isCurrentMonth ? '' : 'other'} ${pnlClass}`}>
                    <span className="day">{day}</span>
                    {cell.count > 0 ? (
                      <>
                        <strong>{formatCurrency(cell.pnl)}</strong>
                        <small>{cell.count} trade(s)</small>
                      </>
                    ) : (
                      <small>No Trades</small>
                    )}
                  </div>
                )
              })}
            </div>
          </article>

          <article className="card evaluation-card">
            <h2>Evaluation</h2>
            <ul>
              <li>
                <span>Total Number of Trades</span>
                <strong>{tradeMetrics.totalTrades}</strong>
              </li>
              <li>
                <span>Avg. Profit per Trading Day</span>
                <strong>{formatCurrency(tradeMetrics.avgProfitPerDay)}</strong>
              </li>
              <li>
                <span>Biggest Winner</span>
                <strong>{formatCurrency(tradeMetrics.biggestWinner)}</strong>
              </li>
              <li>
                <span>Biggest Loser</span>
                <strong>{formatCurrency(tradeMetrics.biggestLoser)}</strong>
              </li>
              <li>
                <span>Total Fees</span>
                <strong>{formatCurrency(tradeMetrics.totalFees)}</strong>
              </li>
              <li>
                <span>Avg. Hold Time</span>
                <strong>{tradeMetrics.avgHoldHours.toFixed(1)}h</strong>
              </li>
              <li>
                <span>Winning / Losing Days</span>
                <strong>
                  {tradeMetrics.winningDays} / {tradeMetrics.losingDays}
                </strong>
              </li>
              <li>
                <span>PCP/PCR Threshold</span>
                <strong>{pcpActive ? `${requiredR.toFixed(2)}R` : 'Need 30 trades'}</strong>
              </li>
            </ul>
          </article>
        </section>

        <section className="card table-card">
          <h2>Trades</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Setup</th>
                  <th>Session</th>
                  <th>P&L</th>
                  <th>R</th>
                  <th>PCP</th>
                  <th>PCR</th>
                  <th>Tilt</th>
                  <th>Tags</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => {
                  const plannedR = getPlannedR(trade)
                  const realizedR = getRealizedR(trade)
                  const tiltScore = getTiltScore(trade)
                  const pcpState =
                    !pcpActive || plannedR === null
                      ? 'na'
                      : plannedR > requiredR
                        ? 'green'
                        : 'red'
                  const pcrState =
                    !pcpActive || realizedR === null
                      ? 'na'
                      : realizedR > requiredR
                        ? 'green'
                        : 'red'

                  return (
                    <tr key={trade.id}>
                      <td>{new Date(trade.opened_at).toLocaleString()}</td>
                      <td>{trade.symbol}</td>
                      <td>{trade.side.toUpperCase()}</td>
                      <td>{trade.setups?.name ?? '-'}</td>
                      <td>{trade.session}</td>
                      <td className={trade.net_pnl >= 0 ? 'pos' : 'neg'}>{formatCurrency(trade.net_pnl)}</td>
                      <td>{trade.r_multiple !== null ? `${trade.r_multiple.toFixed(2)}R` : '-'}</td>
                      <td>
                        <span className={`traffic ${pcpState}`}>{pcpState === 'na' ? '·' : ''}</span>
                      </td>
                      <td>
                        <span className={`traffic ${pcrState}`}>{pcrState === 'na' ? '·' : ''}</span>
                      </td>
                      <td>
                        <div className="tilt-wrap">
                          <div className="tilt-bar" style={{ width: `${tiltScore}%` }} />
                        </div>
                      </td>
                      <td>{(tradeTags[trade.id] ?? []).join(', ') || '-'}</td>
                      <td>{trade.plan_followed ? 'Yes' : 'No'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {loadingData && <p className="muted">Data laden...</p>}
        </section>

        {error && <p className="err global-err">{error}</p>}
      </section>
    </main>
  )
}

export default App
