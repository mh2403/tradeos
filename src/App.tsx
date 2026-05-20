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

const DEFAULT_ACCOUNTABILITY_SETTINGS: AccountabilitySettings = {
  startingBalance: '10000',
  violationAmount: '50',
  charityName: 'KWF Kankerbestrijding',
  donationUrl: '',
  partnerEmail: '',
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('mh_journal_accountability', JSON.stringify(accountability))
  }, [accountability])

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

    const startingBalance = asNumberOrNull(accountability.startingBalance) ?? 0

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
  }, [filteredTrades, accountability.startingBalance])

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
        bias_plan: form.biasPlan.trim(),
        entry_plan: form.entryPlan.trim(),
        exit_plan: form.exitPlan.trim(),
        focus_review: form.focusReview.trim(),
        chart_screenshot_url: form.chartScreenshotUrl.trim(),
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
  const requiredR = getRequiredRForPositiveExpectancy(tradeMetrics.winrate)
  const pcpActive = tradeMetrics.totalTrades >= 30 && Number.isFinite(requiredR)

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">MH Journal</div>
        <nav>
          <button className="nav-item active">Dashboard</button>
          <button className="nav-item">Trading Journal</button>
          <button className="nav-item">Trade Analytics</button>
          <button className="nav-item">Reports</button>
        </nav>
        <div className="sidebar-footer">
          <p>{session.user.email}</p>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark modus' : 'Light modus'}
          </button>
          <button onClick={signOut}>Uitloggen</button>
        </div>
      </aside>

      <section className="content">
        <header className="toolbar card">
          <div className="toolbar-left">
            <h1>Performance Dashboard</h1>
            <p>Persoonlijke forex journal met accountability, maandrendement en setup-evaluatie.</p>
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
          <article className="card workspace-card">
            <h2>Accountability Settings</h2>
            <div className="mini-row">
              <input
                value={accountability.startingBalance}
                onChange={(e) =>
                  setAccountability((prev) => ({ ...prev, startingBalance: e.target.value }))
                }
                placeholder="Startkapitaal (bv. 10000)"
              />
              <input
                value={accountability.violationAmount}
                onChange={(e) =>
                  setAccountability((prev) => ({ ...prev, violationAmount: e.target.value }))
                }
                placeholder="Boete per violation (€)"
              />
            </div>
            <div className="mini-row">
              <input
                value={accountability.charityName}
                onChange={(e) =>
                  setAccountability((prev) => ({ ...prev, charityName: e.target.value }))
                }
                placeholder="Goed doel"
              />
              <input
                type="email"
                value={accountability.partnerEmail}
                onChange={(e) =>
                  setAccountability((prev) => ({ ...prev, partnerEmail: e.target.value }))
                }
                placeholder="Partner/coach email"
              />
            </div>
            <input
              value={accountability.donationUrl}
              onChange={(e) => setAccountability((prev) => ({ ...prev, donationUrl: e.target.value }))}
              placeholder="Donatie link"
            />
          </article>
          <article className="card workspace-card">
            <h2>Violation Tracker</h2>
            <div className="mini-row violation-grid">
              <div>
                <p className="muted">Open violations</p>
                <h3>{violationStats.violationCount}</h3>
              </div>
              <div>
                <p className="muted">Open boete totaal</p>
                <h3>{formatCurrency(violationStats.fineTotal)}</h3>
              </div>
            </div>
            <p className="muted">
              {violationStats.violationCount > 0
                ? `Plan gebroken trades worden geteld tegen ${formatCurrency(
                    violationStats.finePerViolation,
                  )} per trade.`
                : 'Geen open plan-violations.'}
            </p>
            {accountability.donationUrl.trim() && (
              <a href={accountability.donationUrl} target="_blank" rel="noreferrer" className="donation-link">
                Ga naar donatielink ({accountability.charityName || 'goed doel'})
              </a>
            )}
          </article>
          <article className="card workspace-card">
            <h2>Monthly Return %</h2>
            <div className="monthly-stack">
              {monthlyReturns.slice(-6).map((month) => {
                const positive = month.monthReturnPct >= 0
                const width = `${Math.min(100, Math.max(6, Math.abs(month.monthReturnPct) * 3))}%`
                return (
                  <div key={month.month} className="month-row">
                    <span>{month.month}</span>
                    <div className="month-bar">
                      <div className={`month-fill ${positive ? 'pos' : 'neg'}`} style={{ width }} />
                    </div>
                    <strong>{formatPercent(month.monthReturnPct)}</strong>
                  </div>
                )
              })}
              {monthlyReturns.length === 0 && <p className="muted">Nog geen maanddata beschikbaar.</p>}
            </div>
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

              <div className="two-col">
                <textarea
                  value={form.biasPlan}
                  onChange={(e) => setForm((prev) => ({ ...prev, biasPlan: e.target.value }))}
                  rows={2}
                  placeholder="Bias plan (waarom deze richting?)"
                />
                <textarea
                  value={form.entryPlan}
                  onChange={(e) => setForm((prev) => ({ ...prev, entryPlan: e.target.value }))}
                  rows={2}
                  placeholder="Entry plan"
                />
              </div>

              <div className="two-col">
                <textarea
                  value={form.exitPlan}
                  onChange={(e) => setForm((prev) => ({ ...prev, exitPlan: e.target.value }))}
                  rows={2}
                  placeholder="Exit plan"
                />
                <textarea
                  value={form.focusReview}
                  onChange={(e) => setForm((prev) => ({ ...prev, focusReview: e.target.value }))}
                  rows={2}
                  placeholder="Focus/gevoel review"
                />
              </div>

              <input
                value={form.chartScreenshotUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, chartScreenshotUrl: e.target.value }))}
                placeholder="Chart screenshot URL"
              />

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
          <h2>Performance by Symbol</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Trades</th>
                  <th>Winrate</th>
                  <th>Net P&L</th>
                  <th>Avg R</th>
                </tr>
              </thead>
              <tbody>
                {symbolStats.map((row) => (
                  <tr key={row.symbol}>
                    <td>{row.symbol}</td>
                    <td>{row.trades}</td>
                    <td>{formatPercent(row.winrate)}</td>
                    <td className={row.netPnl >= 0 ? 'pos' : 'neg'}>{formatCurrency(row.netPnl)}</td>
                    <td>{row.avgR === null ? '-' : `${row.avgR.toFixed(2)}R`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {symbolStats.length === 0 && <p className="muted">Geen trades voor symbol-analyse.</p>}
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
                  <th>Chart</th>
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
                      <td>
                        {trade.custom_stats.chart_screenshot_url ? (
                          <a href={trade.custom_stats.chart_screenshot_url} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
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
