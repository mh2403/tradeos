import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from './supabaseClient'

type TradingAccount = {
  id: string
  name: string
  broker: string | null
  account_currency: string
  starting_balance: number | null
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
  biasPlan: string
  entryPlan: string
  exitPlan: string
  focusReview: string
  chartScreenshotUrl: string
  note: string
  tagsCsv: string
}

type AccountabilitySettings = {
  startingBalance: string
  violationAmount: string
  charityName: string
  donationUrl: string
  partnerEmail: string
}

type ThemeMode = 'light' | 'dark'
type PnlPeriod = 'month' | 'quarter' | 'year'

type Mt5SyncSettings = {
  accountLabel: string
  apiKey: string
  autoSyncEnabled: boolean
  broker: string
  server: string
}

type EditTradeForm = {
  id: string
  symbol: string
  side: 'long' | 'short'
  positionSize: string
  ticketReference: string
  entryPrice: string
  exitPrice: string
  stopLoss: string
  takeProfit: string
  openedAt: string
  closedAt: string
  netPnl: string
  fees: string
  chartScreenshotUrl: string
  note: string
}

const DEFAULT_ACCOUNTABILITY_SETTINGS: AccountabilitySettings = {
  startingBalance: '0',
  violationAmount: '50',
  charityName: 'KWF Kankerbestrijding',
  donationUrl: '',
  partnerEmail: '',
}

const DEFAULT_MT5_SYNC_SETTINGS: Mt5SyncSettings = {
  accountLabel: 'Main MT5',
  apiKey: '',
  autoSyncEnabled: false,
  broker: '',
  server: '',
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
  biasPlan: '',
  entryPlan: '',
  exitPlan: '',
  focusReview: '',
  chartScreenshotUrl: '',
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
const monthKeyFromIso = (iso: string) => iso.slice(0, 7)
const toDateTimeInputValue = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localTime.toISOString().slice(0, 16)
}

const formatDayModalTitle = (dayKey: string) => {
  const title = new Date(`${dayKey}T00:00:00Z`).toLocaleDateString('nl-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return title.charAt(0).toUpperCase() + title.slice(1)
}

const quarterKeyFromIso = (iso: string) => {
  const d = new Date(iso)
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}

const createEmptyEditTradeForm = (): EditTradeForm => ({
  id: '',
  symbol: '',
  side: 'long',
  positionSize: '',
  ticketReference: '',
  entryPrice: '',
  exitPrice: '',
  stopLoss: '',
  takeProfit: '',
  openedAt: '',
  closedAt: '',
  netPnl: '',
  fees: '',
  chartScreenshotUrl: '',
  note: '',
})

const createEditTradeForm = (trade: Trade): EditTradeForm => ({
  id: trade.id,
  symbol: trade.symbol,
  side: trade.side,
  positionSize: trade.position_size === null ? '' : String(trade.position_size),
  ticketReference: trade.custom_stats.ticket_reference ?? trade.custom_stats.ticket_ref ?? '',
  entryPrice: trade.entry_price === null ? '' : String(trade.entry_price),
  exitPrice: trade.exit_price === null ? '' : String(trade.exit_price),
  stopLoss: trade.stop_loss === null ? '' : String(trade.stop_loss),
  takeProfit: trade.take_profit === null ? '' : String(trade.take_profit),
  openedAt: toDateTimeInputValue(trade.opened_at),
  closedAt: toDateTimeInputValue(trade.closed_at),
  netPnl: String(trade.net_pnl),
  fees: String(trade.fees ?? 0),
  chartScreenshotUrl: trade.custom_stats.chart_screenshot_url ?? '',
  note: trade.note ?? '',
})

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
  const [authLoading, setAuthLoading] = useState(false)
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = window.localStorage.getItem('mh_journal_theme')
    if (stored === 'light' || stored === 'dark') return stored
    return 'light'
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
  const [pnlPeriod, setPnlPeriod] = useState<PnlPeriod>('month')
  const [manualTradeOpen, setManualTradeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null)
  const [editingTradeForm, setEditingTradeForm] = useState<EditTradeForm>(createEmptyEditTradeForm())
  const [savingEditTrade, setSavingEditTrade] = useState(false)
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null)

  const symbolFilter: string = ''
  const setupFilter: string = 'all'
  const sessionFilter: string = 'all'
  const tagFilter: string = 'all'
  const planFilter: 'all' | 'followed' | 'broken' = 'all'
  const minConfidenceFilter: string = ''
  const emotionFilter: string = 'all'
  const marketConditionFilter: string = 'all'
  const [accountCurrency, setAccountCurrency] = useState('EUR')

  const [form, setForm] = useState<TradeForm>(createDefaultTradeForm())
  const [accountability, setAccountability] = useState<AccountabilitySettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_ACCOUNTABILITY_SETTINGS
    try {
      const raw = window.localStorage.getItem('mh_journal_accountability')
      if (!raw) return DEFAULT_ACCOUNTABILITY_SETTINGS
      const parsed = JSON.parse(raw) as Partial<AccountabilitySettings>
      return {
        startingBalance: parsed.startingBalance ?? DEFAULT_ACCOUNTABILITY_SETTINGS.startingBalance,
        violationAmount: parsed.violationAmount ?? DEFAULT_ACCOUNTABILITY_SETTINGS.violationAmount,
        charityName: parsed.charityName ?? DEFAULT_ACCOUNTABILITY_SETTINGS.charityName,
        donationUrl: parsed.donationUrl ?? DEFAULT_ACCOUNTABILITY_SETTINGS.donationUrl,
        partnerEmail: parsed.partnerEmail ?? DEFAULT_ACCOUNTABILITY_SETTINGS.partnerEmail,
      }
    } catch {
      return DEFAULT_ACCOUNTABILITY_SETTINGS
    }
  })
  const [mt5Sync, setMt5Sync] = useState<Mt5SyncSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_MT5_SYNC_SETTINGS
    try {
      const raw = window.localStorage.getItem('mh_journal_mt5_sync')
      if (!raw) return DEFAULT_MT5_SYNC_SETTINGS
      const parsed = JSON.parse(raw) as Partial<Mt5SyncSettings>
      return {
        accountLabel: parsed.accountLabel ?? DEFAULT_MT5_SYNC_SETTINGS.accountLabel,
        apiKey: parsed.apiKey ?? DEFAULT_MT5_SYNC_SETTINGS.apiKey,
        autoSyncEnabled: parsed.autoSyncEnabled ?? DEFAULT_MT5_SYNC_SETTINGS.autoSyncEnabled,
        broker: parsed.broker ?? DEFAULT_MT5_SYNC_SETTINGS.broker,
        server: parsed.server ?? DEFAULT_MT5_SYNC_SETTINGS.server,
      }
    } catch {
      return DEFAULT_MT5_SYNC_SETTINGS
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('mh_journal_accountability', JSON.stringify(accountability))
  }, [accountability])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('mh_journal_mt5_sync', JSON.stringify(mt5Sync))
  }, [mt5Sync])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('mh_journal_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
            .select('id, name, broker, account_currency, starting_balance')
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
      setAccountCurrency(loadedAccounts[0]?.account_currency ?? 'EUR')

      setForm((prev) => {
        const accountId = prev.accountId || loadedAccounts[0]?.id || ''
        const setupId = prev.setupId || loadedSetups[0]?.id || ''
        return { ...prev, accountId, setupId }
      })

      setLoadingData(false)
    }

    loadWorkspace()
  }, [session])

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

  const activeTradingAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId) ?? accounts[0] ?? null,
    [accounts, form.accountId],
  )
  const effectiveStartingBalance = useMemo(() => {
    if (activeTradingAccount?.starting_balance !== null && activeTradingAccount?.starting_balance !== undefined) {
      return Number(activeTradingAccount.starting_balance)
    }
    return 0
  }, [activeTradingAccount])

  const monthlyReturns = useMemo(() => {
    const closedTrades = filteredTrades.filter((trade) => trade.status !== 'open')
    const monthMap = new Map<string, { pnl: number; trades: number }>()

    for (const trade of closedTrades) {
      const key = monthKeyFromIso(trade.closed_at ?? trade.opened_at)
      const row = monthMap.get(key) ?? { pnl: 0, trades: 0 }
      row.pnl += trade.net_pnl
      row.trades += 1
      monthMap.set(key, row)
    }

    const startingBalance = effectiveStartingBalance

    const aggregated = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<{
        rollingBalance: number
        rows: Array<{
          month: string
          pnl: number
          trades: number
          monthReturnPct: number
          endBalance: number
        }>
      }>(
        (acc, [month, value]) => {
          const monthStart = acc.rollingBalance
          const monthReturnPct = monthStart > 0 ? (value.pnl / monthStart) * 100 : 0
          const endBalance = monthStart + value.pnl

          return {
            rollingBalance: endBalance,
            rows: [
              ...acc.rows,
              {
                month,
                pnl: value.pnl,
                trades: value.trades,
                monthReturnPct,
                endBalance,
              },
            ],
          }
        },
        { rollingBalance: startingBalance, rows: [] },
      )

    return aggregated.rows
  }, [filteredTrades, effectiveStartingBalance])

  const symbolStats = useMemo(() => {
    const closedTrades = filteredTrades.filter((trade) => trade.status !== 'open')
    const symbolMap = new Map<
      string,
      { trades: number; wins: number; netPnl: number; rTotal: number; rCount: number }
    >()

    for (const trade of closedTrades) {
      const key = trade.symbol
      const row = symbolMap.get(key) ?? { trades: 0, wins: 0, netPnl: 0, rTotal: 0, rCount: 0 }
      row.trades += 1
      if (trade.net_pnl > 0) row.wins += 1
      row.netPnl += trade.net_pnl
      if (trade.r_multiple !== null) {
        row.rTotal += trade.r_multiple
        row.rCount += 1
      }
      symbolMap.set(key, row)
    }

    return Array.from(symbolMap.entries())
      .map(([symbol, row]) => ({
        symbol,
        trades: row.trades,
        winrate: row.trades > 0 ? (row.wins / row.trades) * 100 : 0,
        netPnl: row.netPnl,
        avgR: row.rCount > 0 ? row.rTotal / row.rCount : null,
      }))
      .sort((a, b) => b.netPnl - a.netPnl)
  }, [filteredTrades])

  const violationStats = useMemo(() => {
    const violationCount = filteredTrades.filter((trade) => !trade.plan_followed).length
    const finePerViolation = asNumberOrNull(accountability.violationAmount) ?? 0
    return {
      violationCount,
      finePerViolation,
      fineTotal: violationCount * finePerViolation,
    }
  }, [filteredTrades, accountability.violationAmount])

  const accountSnapshot = useMemo(() => {
    const startingBalance = effectiveStartingBalance
    const currentBalance = startingBalance + tradeMetrics.netReturn
    const returnPct = startingBalance > 0 ? (tradeMetrics.netReturn / startingBalance) * 100 : 0
    const profitableMonths = monthlyReturns.filter((row) => row.pnl > 0).length
    const losingMonths = monthlyReturns.filter((row) => row.pnl < 0).length

    return {
      startingBalance,
      currentBalance,
      returnPct,
      profitableMonths,
      losingMonths,
    }
  }, [effectiveStartingBalance, tradeMetrics.netReturn, monthlyReturns])

  const dashboardMetrics = useMemo(() => {
    const closedTrades = filteredTrades.filter((trade) => trade.status !== 'open')
    const followed = closedTrades.filter((trade) => trade.plan_followed).length
    const wins = closedTrades.filter((trade) => trade.net_pnl > 0).length
    const losses = closedTrades.filter((trade) => trade.net_pnl < 0).length
    const openTrades = filteredTrades.filter((trade) => trade.status === 'open').length
    const avgPerTrade = closedTrades.length > 0 ? tradeMetrics.netReturn / closedTrades.length : 0
    const planAdherence = closedTrades.length > 0 ? (followed / closedTrades.length) * 100 : 0
    return {
      wins,
      losses,
      followed,
      openTrades,
      avgPerTrade,
      planAdherence,
    }
  }, [filteredTrades, tradeMetrics.netReturn])

  const pnlBars = useMemo(() => {
    const closedTrades = filteredTrades.filter((trade) => trade.status !== 'open')
    const map = new Map<string, number>()

    for (const trade of closedTrades) {
      const iso = trade.closed_at ?? trade.opened_at
      const key =
        pnlPeriod === 'month'
          ? monthKeyFromIso(iso)
          : pnlPeriod === 'quarter'
            ? quarterKeyFromIso(iso)
            : iso.slice(0, 4)
      map.set(key, (map.get(key) ?? 0) + trade.net_pnl)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([label, value]) => ({ label, value }))
  }, [filteredTrades, pnlPeriod])

  const activityTrades = useMemo(() => filteredTrades.slice(0, 8), [filteredTrades])
  const dayTradesMap = useMemo(() => {
    const map = new Map<string, Trade[]>()
    for (const trade of filteredTrades) {
      const key = dayKeyFromIso(trade.closed_at ?? trade.opened_at)
      const rows = map.get(key) ?? []
      rows.push(trade)
      map.set(key, rows)
    }

    for (const [key, rows] of map.entries()) {
      rows.sort((a, b) => b.opened_at.localeCompare(a.opened_at))
      map.set(key, rows)
    }

    return map
  }, [filteredTrades])

  const selectedDayTrades = useMemo(
    () => (selectedDayKey ? dayTradesMap.get(selectedDayKey) ?? [] : []),
    [selectedDayKey, dayTradesMap],
  )
  const selectedDayPnl = useMemo(
    () => selectedDayTrades.reduce((sum, trade) => sum + trade.net_pnl, 0),
    [selectedDayTrades],
  )
  const selectedDayReturnPct = useMemo(() => {
    const start = effectiveStartingBalance
    if (start <= 0) return 0
    return (selectedDayPnl / start) * 100
  }, [selectedDayPnl, effectiveStartingBalance])
  const editingTrade = useMemo(
    () => trades.find((trade) => trade.id === editingTradeId) ?? null,
    [trades, editingTradeId],
  )

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

  const openEditTrade = (tradeId: string) => {
    const trade = trades.find((row) => row.id === tradeId)
    if (!trade) return
    setEditingTradeForm(createEditTradeForm(trade))
    setEditingTradeId(tradeId)
  }

  const closeEditTrade = () => {
    setEditingTradeId(null)
    setEditingTradeForm(createEmptyEditTradeForm())
  }

  const signInWithPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setAuthLoading(true)
    setError('')
    setMessage('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('invalid login credentials')) {
        setError(
          'Invalid login credentials. Controleer wachtwoord of bevestig eerst je e-mail. Gebruik eventueel "Bevestigingsmail opnieuw sturen".',
        )
      } else {
        setError(authError.message)
      }
    }

    setAuthLoading(false)
  }

  const signUpWithPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return

    if (password.length < 6) {
      setError('Wachtwoord moet minstens 6 tekens bevatten.')
      return
    }

    if (password !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen.')
      return
    }

    setAuthLoading(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    })

    if (authError) {
      setError(authError.message)
    } else if (!data.session) {
      setMessage('Account gemaakt. Bevestig je e-mail en log daarna in.')
      setAuthMode('login')
      setPassword('')
      setConfirmPassword('')
    } else {
      setMessage('Account aangemaakt en ingelogd.')
    }

    setAuthLoading(false)
  }

  const sendMagicLinkFallback = async () => {
    if (!supabase || !email.trim()) return
    setAuthLoading(true)
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

    setAuthLoading(false)
  }

  const resendConfirmation = async () => {
    if (!supabase || !email.trim()) return
    setAuthLoading(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (resendError) {
      setError(resendError.message)
    } else {
      setMessage('Bevestigingsmail opnieuw verstuurd. Check je inbox/spam.')
    }

    setAuthLoading(false)
  }

  const sendPasswordReset = async () => {
    if (!supabase || !email.trim()) return
    setAuthLoading(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (resetError) {
      setError(resetError.message)
    } else {
      setMessage('Reset e-mail verstuurd. Open de link en kies een nieuw wachtwoord.')
    }

    setAuthLoading(false)
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  const signOut = async () => {
    if (!supabase) return
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
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
        bias_plan: form.biasPlan.trim(),
        entry_plan: form.entryPlan.trim(),
        exit_plan: form.exitPlan.trim(),
        focus_review: form.focusReview.trim(),
        chart_screenshot_url: form.chartScreenshotUrl.trim(),
        ticket_reference: form.tagsCsv.trim(),
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

  const saveEditedTrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase || !editingTrade) return

    const symbol = editingTradeForm.symbol.trim().toUpperCase()
    const netPnl = asNumberOrNull(editingTradeForm.netPnl)
    if (!symbol || netPnl === null) {
      setError('Symbol en P&L zijn verplicht.')
      return
    }

    setSavingEditTrade(true)
    setError('')

    const openedAt = editingTradeForm.openedAt
      ? new Date(editingTradeForm.openedAt).toISOString()
      : editingTrade.opened_at
    const closedAt = editingTradeForm.closedAt
      ? new Date(editingTradeForm.closedAt).toISOString()
      : null
    const riskAmount = editingTrade.risk_amount
    const rMultiple = riskAmount && riskAmount !== 0 ? netPnl / riskAmount : null

    const updatePayload = {
      symbol,
      side: editingTradeForm.side,
      opened_at: openedAt,
      closed_at: closedAt,
      status: closedAt ? 'closed' : 'open',
      entry_price: asNumberOrNull(editingTradeForm.entryPrice),
      exit_price: asNumberOrNull(editingTradeForm.exitPrice),
      stop_loss: asNumberOrNull(editingTradeForm.stopLoss),
      take_profit: asNumberOrNull(editingTradeForm.takeProfit),
      position_size: asNumberOrNull(editingTradeForm.positionSize),
      fees: asNumberOrNull(editingTradeForm.fees) ?? 0,
      net_pnl: netPnl,
      r_multiple: rMultiple,
      note: editingTradeForm.note.trim() || null,
      custom_stats: {
        ...(editingTrade.custom_stats ?? {}),
        ticket_reference: editingTradeForm.ticketReference.trim(),
        chart_screenshot_url: editingTradeForm.chartScreenshotUrl.trim(),
      },
    }

    const { data: updatedTrade, error: updateError } = await supabase
      .from('trades')
      .update(updatePayload)
      .eq('id', editingTrade.id)
      .select(
        'id, symbol, side, session, status, opened_at, closed_at, entry_price, exit_price, stop_loss, take_profit, risk_amount, position_size, fees, swap, net_pnl, r_multiple, confidence, plan_followed, entry_comment, management_comment, exit_comment, entry_rating, management_rating, exit_rating, custom_stats, note, account_id, setup_id, trading_accounts(name, account_currency), setups(name)',
      )
      .single()

    if (updateError || !updatedTrade) {
      setError(updateError?.message ?? 'Trade kon niet opgeslagen worden.')
      setSavingEditTrade(false)
      return
    }

    const normalized = normalizeTrade(updatedTrade as unknown as RawTrade)
    setTrades((prev) => prev.map((trade) => (trade.id === normalized.id ? normalized : trade)))
    setSavingEditTrade(false)
    closeEditTrade()
  }

  const deleteTrade = async (tradeId: string) => {
    if (!supabase) return
    setDeletingTradeId(tradeId)
    setError('')

    const { error: deleteError } = await supabase.from('trades').delete().eq('id', tradeId)
    if (deleteError) {
      setError(deleteError.message)
      setDeletingTradeId(null)
      return
    }

    setTrades((prev) => prev.filter((trade) => trade.id !== tradeId))
    setTradeTags((prev) => {
      const next = { ...prev }
      delete next[tradeId]
      return next
    })
    setDeletingTradeId(null)

    if (editingTradeId === tradeId) closeEditTrade()
  }

  const updateActiveAccountStartingBalance = async (value: string) => {
    if (!supabase || !activeTradingAccount) return
    const parsed = asNumberOrNull(value)
    if (value.trim() && parsed === null) {
      setError('Startkapitaal moet een geldig nummer zijn.')
      return
    }

    const { error: updateError } = await supabase
      .from('trading_accounts')
      .update({ starting_balance: parsed })
      .eq('id', activeTradingAccount.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === activeTradingAccount.id ? { ...account, starting_balance: parsed } : account,
      ),
    )
  }

  if (!supabase) {
    return (
      <main className="shell">
        <section className="card auth-card">
          <button type="button" className="theme-toggle theme-toggle-auth" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark modus' : 'Light modus'}
          </button>
          <h1>MH Journal</h1>
          <p className="err">{supabaseConfigError}</p>
        </section>
      </main>
    )
  }

  if (booting) {
    return (
      <main className="shell">
        <p>MH Journal opstarten...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="shell">
        <section className="card auth-card">
          <button type="button" className="theme-toggle theme-toggle-auth" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark modus' : 'Light modus'}
          </button>
          <h1>MH Journal</h1>
          <p>Log in met e-mail en wachtwoord om je trading data veilig te beheren.</p>
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-mode-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('login')
                setMessage('')
                setError('')
              }}
            >
              Inloggen
            </button>
            <button
              type="button"
              className={`auth-mode-tab ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('signup')
                setMessage('')
                setError('')
              }}
            >
              Registreren
            </button>
          </div>
          <form onSubmit={authMode === 'login' ? signInWithPassword : signUpWithPassword} className="stack">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jij@domein.com"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Wachtwoord"
              required
            />
            {authMode === 'signup' && (
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Herhaal wachtwoord"
                required
              />
            )}
            <button type="submit" disabled={authLoading}>
              {authLoading
                ? 'Even bezig...'
                : authMode === 'login'
                  ? 'Inloggen'
                  : 'Account aanmaken'}
            </button>
          </form>
          <button
            type="button"
            className="ghost-button"
            onClick={sendMagicLinkFallback}
            disabled={authLoading || !email.trim()}
          >
            Of stuur toch een magic link
          </button>
          <div className="auth-help-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={resendConfirmation}
              disabled={authLoading || !email.trim()}
            >
              Bevestigingsmail opnieuw sturen
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={sendPasswordReset}
              disabled={authLoading || !email.trim()}
            >
              Wachtwoord reset mail sturen
            </button>
          </div>
          {message && <p className="ok">{message}</p>}
          {error && <p className="err">{error}</p>}
        </section>
      </main>
    )
  }

  const monthTitle = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const displayName = 'Mattis'
  return (
    <main className="dv-shell">
      <header className="dv-topbar">
        <div className="dv-brand">
          <span className="dot blue" />
          <strong>MH Journal</strong>
          <span className="dot green" />
          <small>live</small>
        </div>
        <div className="dv-topbar-right">
          <button className="chip">{displayName}</button>
          <button type="button" className="theme-toggle chip" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark modus' : 'Light modus'}
          </button>
          <button className="chip" onClick={signOut}>
            Uitloggen
          </button>
        </div>
      </header>

      <section className="dv-main">
        <div className="dv-headline-row">
          <div>
            <h1>Goedemorgen {displayName}</h1>
            <p>Plan je trade, dan trade je het plan.</p>
          </div>
          <div className="dv-actions">
            <button className="ghost-button" onClick={() => setManualTradeOpen(true)}>
              + Trade handmatig
            </button>
            <button onClick={() => setSettingsOpen(true)}>+ Nieuw trade plan</button>
          </div>
        </div>

        {violationStats.violationCount > 0 && (
          <article className="dv-alert danger">
            <div>
              <strong>{formatCurrency(violationStats.fineTotal)} open</strong>
              <p>
                {violationStats.violationCount} plan-violations voor {accountability.charityName || 'goed doel'}.
                Geen plan = boete.
              </p>
            </div>
            <div className="dv-alert-actions">
              <button className="ghost-button">Bekijk</button>
              <button onClick={() => accountability.donationUrl && window.open(accountability.donationUrl, '_blank')}>
                Doneer nu
              </button>
            </div>
          </article>
        )}

        <section className="dv-kpis">
          <article className="dv-kpi card">
            <p>WIN RATE</p>
            <h3>{formatPercent(tradeMetrics.winrate)}</h3>
            <small>
              {dashboardMetrics.wins}W / {dashboardMetrics.losses}L
            </small>
          </article>
          <article className="dv-kpi card">
            <p>PLAN ADHERENCE</p>
            <h3>{formatPercent(dashboardMetrics.planAdherence)}</h3>
            <small>
              {dashboardMetrics.followed} plans, {tradeMetrics.totalTrades} trades
            </small>
          </article>
          <article className="dv-kpi card">
            <p>RENDEMENT</p>
            <h3>{formatPercent(accountSnapshot.returnPct)}</h3>
            <small>
              {formatCurrency(accountSnapshot.startingBalance)} startkapitaal
            </small>
          </article>
          <article className="dv-kpi card">
            <p>AVG R:R</p>
            <h3>{tradeMetrics.avgR.toFixed(2)}R</h3>
            <small>PF {tradeMetrics.profitFactor.toFixed(2)}</small>
          </article>
          <article className="dv-kpi card">
            <p>NET P&L</p>
            <h3>{formatCurrency(tradeMetrics.netReturn)}</h3>
            <small>{formatCurrency(dashboardMetrics.avgPerTrade)} / trade</small>
          </article>
          <article className="dv-kpi card">
            <p>TRADES</p>
            <h3>{tradeMetrics.totalTrades}</h3>
            <small>
              {tradeMetrics.totalTrades} closed · {dashboardMetrics.openTrades} open
            </small>
          </article>
        </section>

        <p className="muted">
          Accounts: {accounts.length} · Setups: {setups.length} · Tags: {tags.length}
        </p>

        <article className="dv-warning">
          Slechts {formatPercent(dashboardMetrics.planAdherence)} van je trades had een pre-trade plan.
          Discipline issue.
        </article>
        {violationStats.violationCount > 0 && (
          <article className="dv-warning">
            Je staat {formatCurrency(violationStats.fineTotal)} open aan boetes voor{' '}
            {accountability.charityName || 'goed doel'}.
          </article>
        )}

        <section className="dv-grid-top">
          <article className="card dv-pnl-card">
            <div className="card-head">
              <div>
                <h2>P&L over tijd</h2>
                <p>
                  {tradeMetrics.totalTrades} trades · netto {formatCurrency(tradeMetrics.netReturn)} ·{' '}
                  {formatPercent(accountSnapshot.returnPct)} rendement
                </p>
              </div>
              <div className="segmented">
                <button
                  className={pnlPeriod === 'month' ? 'active' : ''}
                  onClick={() => setPnlPeriod('month')}
                >
                  Maand
                </button>
                <button
                  className={pnlPeriod === 'quarter' ? 'active' : ''}
                  onClick={() => setPnlPeriod('quarter')}
                >
                  Kwartaal
                </button>
                <button className={pnlPeriod === 'year' ? 'active' : ''} onClick={() => setPnlPeriod('year')}>
                  Jaar
                </button>
              </div>
            </div>
            <div className="bar-chart">
              {pnlBars.length === 0 ? (
                <p className="muted">Nog geen closed trades</p>
              ) : (
                pnlBars.map((bar) => (
                  <div key={bar.label} className="bar-wrap">
                    <div
                      className={`bar ${bar.value >= 0 ? 'pos' : 'neg'}`}
                      style={{ height: `${Math.max(8, Math.min(160, Math.abs(bar.value) * 0.15))}px` }}
                    />
                    <small>{bar.label.replace('2026-', '')}</small>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="card calendar-card">
            <div className="calendar-header">
              <h2>{monthTitle}</h2>
              <div className="calendar-controls">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth(
                      (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)),
                    )
                  }
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMonth(
                      (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)),
                    )
                  }
                >
                  ›
                </button>
              </div>
            </div>
            <p className="muted">Hoeveel je per dag hebt gedraaid</p>
            <div className="calendar-grid labels">
              {['M', 'D', 'W', 'D', 'V', 'Z', 'Z'].map((label) => (
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
                  <button
                    key={cell.key}
                    type="button"
                    className={`calendar-cell ${cell.isCurrentMonth ? '' : 'other'} ${pnlClass} ${cell.count > 0 ? 'clickable' : ''}`}
                    onClick={() => {
                      if (cell.count > 0) setSelectedDayKey(cell.key)
                    }}
                  >
                    <span className="day">{day}</span>
                    {cell.count > 0 && <small>{cell.count} trades</small>}
                  </button>
                )
              })}
            </div>
            <p className="muted">
              {filteredTrades.length} trades · {formatCurrency(tradeMetrics.netReturn)} deze maand
            </p>
          </article>
        </section>

        <section className="dv-grid-bottom">
          <article className="card dv-activity">
            <div className="card-head">
              <div>
                <h2>Activiteit</h2>
                <p>Live trades en plans</p>
              </div>
              <div className="segmented">
                <button className="active">Alles</button>
                <button>Trades</button>
                <button>Plans</button>
              </div>
            </div>
            <div className="activity-list">
              {activityTrades.length === 0 && <p className="muted">Nog geen activiteit.</p>}
              {activityTrades.map((trade) => (
                <div key={trade.id} className="activity-row">
                  <div>
                    <strong>{trade.symbol}</strong>
                    <small>
                      {trade.side.toUpperCase()} · {trade.setups?.name ?? 'geen plan'}
                    </small>
                  </div>
                  <div className="activity-row-right">
                    <strong className={trade.net_pnl >= 0 ? 'pos' : 'neg'}>{formatCurrency(trade.net_pnl)}</strong>
                    <button type="button" className="ghost-button row-edit-btn" onClick={() => openEditTrade(trade.id)}>
                      bewerk
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card dv-symbol">
            <h2>Per symbool</h2>
            <p>Win rate + avg R:R over closed trades</p>
            <div className="symbol-list">
              {symbolStats.length === 0 && <p className="muted">Nog geen closed trades</p>}
              {symbolStats.map((row) => (
                <div key={row.symbol} className="symbol-row">
                  <div>
                    <strong>{row.symbol}</strong>
                    <small>
                      {row.trades} trades · {formatCurrency(row.netPnl)} · R:R{' '}
                      {row.avgR === null ? '—' : row.avgR.toFixed(2)}
                    </small>
                  </div>
                  <div className="symbol-rate">
                    <span>{formatPercent(row.winrate)}</span>
                    <div className="symbol-bar">
                      <div style={{ width: `${Math.max(2, Math.min(100, row.winrate))}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="dv-grid-bottom">
          <article className="card">
            <h2>Export</h2>
            <p>Download je trades als CSV voor verdere analyse</p>
            <button className="ghost-button">⬇ Download CSV</button>
          </article>
        </section>

        {loadingData && <p className="muted">Data laden...</p>}
        {error && <p className="err global-err">{error}</p>}
      </section>

      {manualTradeOpen && (
        <div className="modal-backdrop" onClick={() => setManualTradeOpen(false)}>
          <article className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Trade handmatig toevoegen</h2>
            <p>Voor trades buiten je MT5 om (TradingView paper, prop firm, etc.)</p>
            <form onSubmit={createTrade} className="trade-form">
              <div className="two-col">
                <input
                  value={form.symbol}
                  onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))}
                  placeholder="EURUSD"
                  required
                />
                <select
                  value={form.side}
                  onChange={(e) => setForm((prev) => ({ ...prev, side: e.target.value as 'long' | 'short' }))}
                >
                  <option value="long">Long (buy)</option>
                  <option value="short">Short (sell)</option>
                </select>
              </div>
              <div className="two-col">
                <input
                  value={form.positionSize}
                  onChange={(e) => setForm((prev) => ({ ...prev, positionSize: e.target.value }))}
                  placeholder="Volume (lots)"
                />
                <input
                  value={form.tagsCsv}
                  onChange={(e) => setForm((prev) => ({ ...prev, tagsCsv: e.target.value }))}
                  placeholder="Ticket / referentie"
                />
              </div>
              <div className="two-col">
                <input
                  value={form.entryPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, entryPrice: e.target.value }))}
                  placeholder="Entry prijs"
                />
                <input
                  value={form.exitPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, exitPrice: e.target.value }))}
                  placeholder="Exit prijs"
                />
              </div>
              <div className="two-col">
                <input
                  value={form.stopLoss}
                  onChange={(e) => setForm((prev) => ({ ...prev, stopLoss: e.target.value }))}
                  placeholder="Stop loss"
                />
                <input
                  value={form.takeProfit}
                  onChange={(e) => setForm((prev) => ({ ...prev, takeProfit: e.target.value }))}
                  placeholder="Take profit"
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
              <div className="two-col">
                <input
                  value={form.netPnl}
                  onChange={(e) => setForm((prev) => ({ ...prev, netPnl: e.target.value }))}
                  placeholder="P&L (bv. 183.50)"
                  required
                />
                <input
                  value={form.fees}
                  onChange={(e) => setForm((prev) => ({ ...prev, fees: e.target.value }))}
                  placeholder="Commissie"
                />
              </div>
              <textarea
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                rows={3}
                placeholder="Notitie - wat ging er goed/fout?"
              />
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setManualTradeOpen(false)}>
                  Annuleren
                </button>
                <button type="submit" disabled={submittingTrade}>
                  {submittingTrade ? 'Opslaan...' : 'Trade opslaan'}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {selectedDayKey && (
        <div className="modal-backdrop" onClick={() => setSelectedDayKey(null)}>
          <article className="modal-card day-detail-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{formatDayModalTitle(selectedDayKey)}</h2>
            <p>
              {selectedDayTrades.length} trades · {formatCurrency(selectedDayPnl)} ·{' '}
              {formatPercent(selectedDayReturnPct)}
            </p>
            <div className="day-trade-list">
              {selectedDayTrades.map((trade) => {
                const ticketRef =
                  trade.custom_stats.ticket_reference ?? trade.custom_stats.ticket_ref ?? `#${trade.id.slice(0, 8)}`
                return (
                  <button
                    key={trade.id}
                    type="button"
                    className="day-trade-row"
                    onClick={() => {
                      setSelectedDayKey(null)
                      openEditTrade(trade.id)
                    }}
                  >
                    <div className="day-trade-left">
                      <strong>{trade.symbol}</strong>
                      <small>
                        {(trade.position_size ?? 0).toString().replace('.', ',')} lots · {ticketRef} · MT5
                      </small>
                    </div>
                    <div className="day-trade-right">
                      <strong className={trade.net_pnl >= 0 ? 'pos' : 'neg'}>{formatCurrency(trade.net_pnl)}</strong>
                      <small>⟲ bewerk</small>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setSelectedDayKey(null)}>
                Sluiten
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayKey(null)
                  setManualTradeOpen(true)
                }}
              >
                + Trade toevoegen
              </button>
            </div>
          </article>
        </div>
      )}

      {editingTrade && (
        <div className="modal-backdrop" onClick={closeEditTrade}>
          <article className="modal-card edit-trade-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Trade bewerken — {editingTrade.symbol}</h2>
            <p>
              Pas details aan, voeg een chart-screenshot of notitie toe. MT5-trades worden bij volgende sync deels
              overschreven.
            </p>
            <form onSubmit={saveEditedTrade} className="trade-form">
              <div className="two-col">
                <input
                  value={editingTradeForm.symbol}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, symbol: e.target.value }))}
                  placeholder="Symbol"
                  required
                />
                <select
                  value={editingTradeForm.side}
                  onChange={(e) =>
                    setEditingTradeForm((prev) => ({ ...prev, side: e.target.value as 'long' | 'short' }))
                  }
                >
                  <option value="long">↑ Long (buy)</option>
                  <option value="short">↓ Short (sell)</option>
                </select>
              </div>
              <div className="two-col">
                <input
                  value={editingTradeForm.positionSize}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, positionSize: e.target.value }))}
                  placeholder="Volume (lots)"
                />
                <input
                  value={editingTradeForm.ticketReference}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, ticketReference: e.target.value }))}
                  placeholder="Ticket / referentie"
                />
              </div>
              <div className="two-col">
                <input
                  value={editingTradeForm.entryPrice}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, entryPrice: e.target.value }))}
                  placeholder="Entry prijs"
                />
                <input
                  value={editingTradeForm.exitPrice}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, exitPrice: e.target.value }))}
                  placeholder="Exit prijs"
                />
              </div>
              <div className="two-col">
                <input
                  value={editingTradeForm.stopLoss}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, stopLoss: e.target.value }))}
                  placeholder="Stop loss"
                />
                <input
                  value={editingTradeForm.takeProfit}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, takeProfit: e.target.value }))}
                  placeholder="Take profit"
                />
              </div>
              <div className="two-col">
                <input
                  type="datetime-local"
                  value={editingTradeForm.openedAt}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, openedAt: e.target.value }))}
                />
                <input
                  type="datetime-local"
                  value={editingTradeForm.closedAt}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, closedAt: e.target.value }))}
                />
              </div>
              <div className="two-col">
                <input
                  value={editingTradeForm.netPnl}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, netPnl: e.target.value }))}
                  placeholder="P&L"
                  required
                />
                <input
                  value={editingTradeForm.fees}
                  onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, fees: e.target.value }))}
                  placeholder="Commissie"
                />
              </div>
              <input
                value={editingTradeForm.chartScreenshotUrl}
                onChange={(e) =>
                  setEditingTradeForm((prev) => ({ ...prev, chartScreenshotUrl: e.target.value }))
                }
                placeholder="Chart screenshot (URL)"
              />
              <textarea
                value={editingTradeForm.note}
                onChange={(e) => setEditingTradeForm((prev) => ({ ...prev, note: e.target.value }))}
                rows={3}
                placeholder="Notitie"
              />
              <div className="modal-actions spread">
                <button
                  type="button"
                  className="ghost-button danger-outline"
                  disabled={deletingTradeId === editingTrade.id}
                  onClick={() => deleteTrade(editingTrade.id)}
                >
                  {deletingTradeId === editingTrade.id ? 'Verwijderen...' : 'Verwijder'}
                </button>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={closeEditTrade}>
                    Annuleren
                  </button>
                  <button type="submit" disabled={savingEditTrade}>
                    {savingEditTrade ? 'Opslaan...' : 'Trade opslaan'}
                  </button>
                </div>
              </div>
            </form>
          </article>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <article className="modal-card settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Instellingen</h2>
            <p>MT5 koppeling, kapitaal en accountability</p>
            <h3>MT5 Koppeling</h3>
            <div className="two-col">
              <input
                value={mt5Sync.apiKey}
                onChange={(e) => setMt5Sync((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="API key (in EA invoeren)"
              />
              <input
                value={mt5Sync.accountLabel}
                onChange={(e) => setMt5Sync((prev) => ({ ...prev, accountLabel: e.target.value }))}
                placeholder="MT5 Login"
              />
            </div>
            <div className="two-col">
              <input
                value={mt5Sync.broker}
                onChange={(e) => setMt5Sync((prev) => ({ ...prev, broker: e.target.value }))}
                placeholder="Broker"
              />
              <input
                value={mt5Sync.server}
                onChange={(e) => setMt5Sync((prev) => ({ ...prev, server: e.target.value }))}
                placeholder="Server"
              />
            </div>
            <h3>Kapitaal & Rendement</h3>
            <div className="two-col">
              <input
                key={activeTradingAccount?.id ?? 'no-account'}
                defaultValue={
                  activeTradingAccount?.starting_balance !== null &&
                  activeTradingAccount?.starting_balance !== undefined
                    ? String(activeTradingAccount.starting_balance)
                    : ''
                }
                onBlur={(e) => {
                  void updateActiveAccountStartingBalance(e.target.value)
                }}
                placeholder="Startkapitaal"
                disabled={!activeTradingAccount}
              />
              <select value={accountCurrency} onChange={(e) => setAccountCurrency(e.target.value)}>
                <option value="EUR">€ EUR</option>
                <option value="USD">$ USD</option>
              </select>
            </div>
            <h3>Accountability</h3>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={mt5Sync.autoSyncEnabled}
                onChange={(e) => setMt5Sync((prev) => ({ ...prev, autoSyncEnabled: e.target.checked }))}
              />
              Boete bij plan-violation
            </label>
            <div className="two-col">
              <input
                value={accountability.violationAmount}
                onChange={(e) =>
                  setAccountability((prev) => ({ ...prev, violationAmount: e.target.value }))
                }
                placeholder="Bedrag per violation"
              />
              <input
                value={accountability.charityName}
                onChange={(e) =>
                  setAccountability((prev) => ({ ...prev, charityName: e.target.value }))
                }
                placeholder="Goed doel"
              />
            </div>
            <input
              value={accountability.donationUrl}
              onChange={(e) => setAccountability((prev) => ({ ...prev, donationUrl: e.target.value }))}
              placeholder="Donatie link (optioneel)"
            />
            <input
              value={accountability.partnerEmail}
              onChange={(e) => setAccountability((prev) => ({ ...prev, partnerEmail: e.target.value }))}
              placeholder="Partner email (optioneel)"
            />
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setSettingsOpen(false)}>
                Sluiten
              </button>
            </div>
          </article>
        </div>
      )}
    </main>
  )
}

export default App
