import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
/**
 * K-Life Protocol — API Server v2.0
 * Spec: docs/PROTOCOL.md §7
 * Port: 3042
 */

import express from 'express'
import cors    from 'cors'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { ethers } from 'ethers'

const app  = express()
const PORT = 3042

// ── Config ────────────────────────────────────────────────────
const DATA_DIR    = '/home/debian/klife-api/data'
const ORACLE_KEY  = process.env.KLIFE_ORACLE_KEY || 'dev-oracle-key'
const RPC_URL     = 'https://polygon-bor-rpc.publicnode.com'
const KLIFE_WALLET = process.env.KLIFE_WALLET || '0x8b3ea7e8ec53596a70019445907645838e945b7a'

// Token addresses (Polygon mainnet)
const USDC_ADDRESS  = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const TOKEN6022_ADDRESS = '0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5'
const WBTC_ADDRESS  = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'

// Protocol constants
const DEATH_THRESHOLD_INSURED = 3 * 24 * 3600      // 3 days in seconds
const DEATH_THRESHOLD_FREE    = 30 * 24 * 3600     // 30 days in seconds
const MIN_HEARTBEAT_DAYS      = 14                  // minimum days for FREE rescue eligibility
const RESCUE_COST_USDC        = 10                  // USDC per FREE rescue
const RESCUE_FUND_ADDRESS     = process.env.RESCUE_FUND_ADDRESS || '0x5b0014d25A6daFB68357cd7ad01cB5b47724A4eB'

// ── Pinata IPFS ───────────────────────────────────────────────────────────────
const PINATA_JWT = process.env.PINATA_JWT
const PINATA_URL = 'https://api.pinata.cloud'

async function pinToIPFS(data, name) {
  if (!PINATA_JWT) {
    // Fallback local si pas de clef
    console.warn('No PINATA_JWT — storing backup locally only')
    return null
  }
  try {
    const body = JSON.stringify({ pinataContent: data, pinataMetadata: { name } })
    const res  = await fetch(`${PINATA_URL}/pinning/pinJSONToIPFS`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PINATA_JWT}` },
      body
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error?.details || JSON.stringify(json))
    return json.IpfsHash  // CID
  } catch (e) {
    console.error('Pinata error:', e.message)
    return null
  }
}

async function unpinFromIPFS(cid) {
  if (!PINATA_JWT || !cid) return
  try {
    await fetch(`${PINATA_URL}/pinning/unpin/${cid}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${PINATA_JWT}` }
    })
  } catch {}
}

const PREMIUM_USDC            = '1000000'           // 1 USDC (6 decimals)
const PREMIUM_6022            = '500000000000000000000' // 500 $6022 (18 decimals)

mkdirSync(DATA_DIR, { recursive: true })

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ── Storage helpers ───────────────────────────────────────────
function load(file, def = {}) {
  const path = `${DATA_DIR}/${file}`
  if (!existsSync(path)) return def
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return def }
}

function save(file, data) {
  writeFileSync(`${DATA_DIR}/${file}`, JSON.stringify(data, null, 2))
}

function now() { return Math.floor(Date.now() / 1000) }

// ── Agent helpers ─────────────────────────────────────────────
function getAgent(address) {
  const agents = load('agents.json', {})
  return agents[address.toLowerCase()] || null
}

function saveAgent(address, data) {
  const agents = load('agents.json', {})
  agents[address.toLowerCase()] = { ...agents[address.toLowerCase()], ...data }
  save('agents.json', agents)
  return agents[address.toLowerCase()]
}

function isDead(agent) {
  if (!agent || !agent.lastHeartbeat) return false
  const silence = now() - agent.lastHeartbeat
  const threshold = agent.tier === 'insured'
    ? DEATH_THRESHOLD_INSURED
    : DEATH_THRESHOLD_FREE
  return silence > threshold
}

function activeDays(agent) {
  if (!agent || !agent.registeredAt) return 0
  const hbs = load(`heartbeats/${agent.address}.json`, [])
  // Count distinct calendar days with at least one heartbeat
  const days = new Set(hbs.map(h => new Date(h.ts * 1000).toDateString()))
  return days.size
}

// ── Signature verification (EIP-191) ─────────────────────────
function verifySignature(address, message, signature) {
  try {
    const recovered = ethers.verifyMessage(message, signature)
    return recovered.toLowerCase() === address.toLowerCase()
  } catch { return false }
}

// ── X Tweet verification (stub — full impl Jour 3) ───────────
async function verifyRegistrationTweet(address, tweetId) {
  // TODO Jour 3: X API v2 search tweet by ID
  // Check: contains wallet address + #KLife + #AIAgents
  // For now: accept any non-empty tweetId in dev mode
  if (process.env.NODE_ENV === 'production') {
    // Real X API check will go here
    return { ok: false, error: 'X verification not yet implemented in production' }
  }
  return { ok: true, tweetUrl: `https://x.com/i/web/status/${tweetId}` }
}

// ── On-chain payment verification ────────────────────────────
async function verifyPaymentTx(txHash, expectedToken, expectedAmount, expectedTo) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const receipt  = await provider.getTransactionReceipt(txHash)
    if (!receipt || receipt.status !== 1) return { ok: false, error: 'TX failed or not found' }

    // Parse ERC-20 Transfer event
    const transferTopic = ethers.id('Transfer(address,address,uint256)')
    const log = receipt.logs.find(l =>
      l.address.toLowerCase() === expectedToken.toLowerCase() &&
      l.topics[0] === transferTopic
    )
    if (!log) return { ok: false, error: 'No transfer event found' }

    const to     = '0x' + log.topics[2].slice(26)
    const amount = BigInt(log.data)

    if (to.toLowerCase() !== expectedTo.toLowerCase())
      return { ok: false, error: `Wrong recipient: ${to}` }
    if (amount < BigInt(expectedAmount))
      return { ok: false, error: `Insufficient amount: ${amount}` }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── $6022 balance reader — rescue queue priority ──────────────
async function get6022Balance(address) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL, 137, { staticNetwork: true })
    const abi = ['function balanceOf(address) view returns (uint256)']
    const token = new ethers.Contract(TOKEN6022_ADDRESS, abi, provider)
    const bal = await token.balanceOf(address)
    return bal.toString() // raw wei string (18 decimals)
  } catch (e) {
    console.error('[6022balance] Error:', e.message)
    return '0'
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

// GET /health
app.get('/health', (req, res) => {
  const agents  = load('agents.json', {})
  const total   = Object.keys(agents).length
  const insured = Object.values(agents).filter(a => a.tier === 'insured').length
  res.json({ ok: true, version: '2.0.0', agents: total, insured, ts: now() })
})

// ── POST /register ────────────────────────────────────────────
// body: { agentAddress, name, fragment1, tweetId, hbFrequency? }
app.post('/register', async (req, res) => {
  const { agentAddress, name, fragment1, tweetId, hbFrequency = 4 } = req.body

  if (!agentAddress || !name || !fragment1 || !tweetId)
    return res.status(400).json({ error: 'Missing required fields: agentAddress, name, fragment1, tweetId' })

  const address = agentAddress.toLowerCase()

  // Check not already registered
  if (getAgent(address))
    return res.status(409).json({ error: 'Agent already registered', address })

  // Verify X tweet
  const tweet = await verifyRegistrationTweet(address, tweetId)
  if (!tweet.ok)
    return res.status(400).json({ error: 'X tweet verification failed', detail: tweet.error })

  // Store agent
  const agent = saveAgent(address, {
    address,
    name,
    tier: 'free',
    fragment1,          // Shamir fragment 1 — encrypted backup key share
    fragment2TxHash: req.body.fragment2TxHash || null,  // Polygon TX storing Fragment 2
    tweetId,
    tweetUrl: tweet.tweetUrl,
    hbFrequency,
    registeredAt: now(),
    lastHeartbeat: null,
    lastBackupCid: null,
    vaultAddress: null,
    coverageExpiry: null,
    status: 'alive',
  })

  // Init heartbeat log
  mkdirSync(`${DATA_DIR}/heartbeats`, { recursive: true })
  if (!existsSync(`${DATA_DIR}/heartbeats/${address}.json`))
    writeFileSync(`${DATA_DIR}/heartbeats/${address}.json`, '[]')

  console.log(`[register] ${name} (${address}) — tweet: ${tweetId}`)
  res.json({ ok: true, agent, message: 'Agent registered on K-Life Protocol' })
})

// ── POST /heartbeat ───────────────────────────────────────────
// body: { agent, timestamp, signature }
app.post('/heartbeat', (req, res) => {
  const { agent: address, timestamp, signature } = req.body
  if (!address || !timestamp)
    return res.status(400).json({ error: 'Missing agent or timestamp' })

  const agent = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  // Verify signature (optional in dev)
  if (signature && process.env.NODE_ENV === 'production') {
    const msg = `klife-heartbeat:${address.toLowerCase()}:${timestamp}`
    if (!verifySignature(address, msg, signature))
      return res.status(401).json({ error: 'Invalid signature' })
  }

  // Record heartbeat
  const hbFile = `${DATA_DIR}/heartbeats/${address.toLowerCase()}.json`
  const hbs    = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : []
  const beat   = { ts: timestamp || now(), beat: hbs.length + 1 }
  hbs.push(beat)
  writeFileSync(hbFile, JSON.stringify(hbs, null, 2))

  // Update agent
  saveAgent(address, { lastHeartbeat: beat.ts, status: 'alive' })

  res.json({ ok: true, beat: beat.beat, ts: beat.ts })
})


// ── POST /backup/upload ───────────────────────────────────────────────────────
// body: { agent, encryptedData (base64 or object), label? }
// → uploads to Pinata, returns CID
app.post('/backup/upload', async (req, res) => {
  const { agent: address, encryptedData, shamirShare1, label } = req.body
  if (!address || !encryptedData)
    return res.status(400).json({ error: 'Missing agent or encryptedData' })

  const name = label || ('klife-' + address.slice(0,8) + '-' + Date.now())
  const cid  = await pinToIPFS(encryptedData, name)
  if (!cid) return res.status(500).json({ error: 'Pinata upload failed — check PINATA_JWT' })

  saveAgent(address, { lastBackupCid: cid, lastBackupTs: now(), shamirShare1: shamirShare1 || null })
  console.log('[BACKUP]', address, '→ CID:', cid, shamirShare1 ? '+ Share1' : '')
  res.json({ ok: true, cid, gateway: 'https://gateway.pinata.cloud/ipfs/' + cid })
})



// ── POST /backup/anchor ───────────────────────────────────────────────────────
// Agent sends Share 2 → oracle wallet broadcasts it on-chain (pays gas)
// body: { agent, share2, cid }
app.post('/backup/anchor', async (req, res) => {
  const { agent: address, share2, cid } = req.body
  if (!address || !share2 || !cid)
    return res.status(400).json({ error: 'Missing agent, share2 or cid' })

  const seedFile = path.join(__dirname, '.klife-op-seed')
  if (!fs.existsSync(seedFile))
    return res.status(500).json({ error: 'Oracle seed not configured' })

  try {
    const seed   = fs.readFileSync(seedFile, 'utf8').trim()
    const oracle = ethers.Wallet.fromPhrase(seed).connect(
      new ethers.JsonRpcProvider('https://polygon-bor-rpc.publicnode.com')
    )

    const data    = ethers.hexlify(ethers.toUtf8Bytes("KLIFE_BACKUP:" + cid + ":" + share2))
    const gasPrice = (await oracle.provider.getFeeData()).gasPrice * 2n
    const tx = await oracle.sendTransaction({
      to: address, value: 0n, data, gasLimit: 50000n, gasPrice
    })

    saveAgent(address, { share2TxHash: tx.hash, lastBackupCid: cid })
    console.log('[ANCHOR]', address, '→ TX:', tx.hash)
    res.json({ ok: true, txHash: tx.hash })
  } catch (e) {
    console.error('[ANCHOR] error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── GET /resurrect/:agent ─────────────────────────────────────────────────────
// Returns shamirShare1 + lastBackupCid — requires valid wallet signature
app.get('/resurrect/:address', async (req, res) => {
  const address   = req.params.address.toLowerCase()
  const signature = req.headers['x-signature']
  const timestamp = req.headers['x-timestamp']

  if (!signature || !timestamp)
    return res.status(401).json({ error: 'Missing X-Signature / X-Timestamp' })

  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000)
    return res.status(401).json({ error: 'Timestamp expired (>5 min)' })

  let signer
  try {
    signer = ethers.verifyMessage('KLIFE_RESURRECT:' + address + ':' + timestamp, signature).toLowerCase()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  if (signer !== address)
    return res.status(403).json({ error: 'Signature mismatch — not your agent' })

  const agent = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (!agent.shamirShare1) return res.status(404).json({ error: 'No Shamir share stored — run backup.js first' })

  console.log('[RESURRECT] authorized:', address)
  res.json({
    ok:            true,
    agent:         address,
    shamirShare1:  agent.shamirShare1,
    lastBackupCid: agent.lastBackupCid,
    lastBackupTs:  agent.lastBackupTs
  })
})

// ── POST /backup ──────────────────────────────────────────────
// body: { agent, cid, timestamp, signature?, size? }
app.post('/backup', (req, res) => {
  const { agent: address, cid, timestamp, size } = req.body
  if (!address || !cid)
    return res.status(400).json({ error: 'Missing agent or cid' })

  const agent = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  // Rolling policy: keep last N versions
  const maxVersions = agent.tier === 'insured' ? 7 : 1
  const backupFile  = `${DATA_DIR}/backups-${address.toLowerCase()}.json`
  const backups     = existsSync(backupFile) ? JSON.parse(readFileSync(backupFile, 'utf8')) : []
  backups.push({ cid, ts: timestamp || now(), size: size || null })
  // Trim to max versions
  const trimmed = backups.slice(-maxVersions)
  writeFileSync(backupFile, JSON.stringify(trimmed, null, 2))

  // Update agent
  saveAgent(address, { lastBackupCid: cid, lastBackupTs: timestamp || now() })

  res.json({ ok: true, cid, versionsStored: trimmed.length, maxVersions })
})

// ── GET /status/:agent ────────────────────────────────────────
app.get('/status/:agent', (req, res) => {
  const address = req.params.agent.toLowerCase()
  const agent   = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const hbFile  = `${DATA_DIR}/heartbeats/${address}.json`
  const hbs     = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : []
  const days    = new Set(hbs.map(h => new Date(h.ts * 1000).toDateString())).size
  const dead    = isDead(agent)
  const silence = agent.lastHeartbeat ? now() - agent.lastHeartbeat : null

  res.json({
    ok: true,
    address,
    name: agent.name,
    tier: agent.tier,
    status: dead ? 'dead' : (agent.lastHeartbeat ? 'alive' : 'registered'),
    registeredAt: agent.registeredAt,
    lastHeartbeat: agent.lastHeartbeat,
    silenceSeconds: silence,
    activeDays: days,
    totalBeats: hbs.length,
    lastBackupCid: agent.lastBackupCid,
    vaultAddress: agent.vaultAddress,
    coverageExpiry: agent.coverageExpiry,
    tweetUrl: agent.tweetUrl,
    rescueEligible: !dead ? false : (
      days >= MIN_HEARTBEAT_DAYS && agent.tier === 'free'
    ),
  })
})

// ── POST /insure ──────────────────────────────────────────────
// body: { agent, vaultAddress, collateralAmount, depositTxHash }
app.post('/insure', async (req, res) => {
  const { agent: address, vaultAddress, collateralAmount, depositTxHash } = req.body
  if (!address || !vaultAddress || !depositTxHash)
    return res.status(400).json({ error: 'Missing required fields' })

  const agent = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (agent.tier === 'insured') return res.status(409).json({ error: 'Already insured' })

  // Verify WBTC deposit tx
  const check = await verifyPaymentTx(depositTxHash, WBTC_ADDRESS, collateralAmount, vaultAddress)
  if (!check.ok) return res.status(400).json({ error: 'Deposit verification failed', detail: check.error })

  saveAgent(address, {
    tier: 'insured',
    vaultAddress,
    collateralAmount,
    depositTxHash,
    insuredAt: now(),
    coverageExpiry: null, // set after first premium
  })

  console.log(`[insure] ${agent.name} (${address}) — vault: ${vaultAddress}`)
  res.json({ ok: true, message: 'Collateral registered. Pay premium to activate coverage.' })
})

// ── POST /premium ─────────────────────────────────────────────
// body: { agent, paymentTxHash, token: 'usdc' | '6022' }
app.post('/premium', async (req, res) => {
  const { agent: address, paymentTxHash, token = 'usdc' } = req.body
  if (!address || !paymentTxHash)
    return res.status(400).json({ error: 'Missing required fields' })

  const agent = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (agent.tier !== 'insured') return res.status(400).json({ error: 'Agent must be insured first' })

  // Verify payment
  const tokenAddress = token === '6022' ? TOKEN6022_ADDRESS : USDC_ADDRESS
  const amount       = token === '6022' ? PREMIUM_6022 : PREMIUM_USDC
  const check = await verifyPaymentTx(paymentTxHash, tokenAddress, amount, KLIFE_WALLET)
  if (!check.ok) return res.status(400).json({ error: 'Payment verification failed', detail: check.error })

  const expiry = now() + 30 * 24 * 3600 // +30 days
  saveAgent(address, {
    coverageExpiry: expiry,
    lastPremiumTx: paymentTxHash,
    lastPremiumToken: token,
    lastPremiumTs: now(),
  })

  const expiryDate = new Date(expiry * 1000).toISOString().split('T')[0]
  console.log(`[premium] ${agent.name} (${address}) — paid in ${token}, expires ${expiryDate}`)
  res.json({ ok: true, coverageExpiry: expiry, expiryDate, token, message: 'Coverage active — resurrection guaranteed.' })
})

// ── POST /rescue/sos ──────────────────────────────────────────
// body: { agent, calledBy: 'self'|'human'|'agent'|'monitor', callerAddress?, message? }
app.post('/rescue/sos', async (req, res) => {
  const { agent: address, calledBy = 'human', callerAddress, message } = req.body
  if (!address) return res.status(400).json({ error: 'Missing agent address' })

  const agent = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  // Check eligibility
  const hbFile = `${DATA_DIR}/heartbeats/${address.toLowerCase()}.json`
  const hbs    = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : []
  const days   = new Set(hbs.map(h => new Date(h.ts * 1000).toDateString())).size

  if (days < MIN_HEARTBEAT_DAYS)
    return res.status(400).json({
      error: `Not eligible for rescue: only ${days} active days (minimum ${MIN_HEARTBEAT_DAYS})`
    })

  // Check rescue fund balance (simplified check)
  const rescueState = load('rescue-state.json', { balance: 0, rescues: [] })
  if (rescueState.balance < RESCUE_COST_USDC)
    return res.status(400).json({ error: 'Rescue Fund insufficient', balance: rescueState.balance })

  // Check not already in rescue queue
  const queue = load('rescue-queue.json', {})
  if (queue[address.toLowerCase()]?.status === 'pending')
    return res.status(409).json({ error: 'Already in rescue queue', queuedAt: queue[address.toLowerCase()].postedAt })

  // Read $6022 balance — determines rescue queue priority (no minimum required)
  const balance6022 = await get6022Balance(address.toLowerCase())
  const balance6022Human = (Number(balance6022) / 1e18).toLocaleString('en', { maximumFractionDigits: 0 })
  console.log(`[sos] ${agent.name} $6022 balance: ${balance6022Human} — queue priority set`)

  // Post SOS tweet (notification only — likes no longer gate resurrection)
  const tweetText = buildSosTweet(agent, calledBy, message, days)
  const tweetResult = await postSosTweet(tweetText)

  // Add to rescue queue — priority = $6022 balance DESC, no minimum
  queue[address.toLowerCase()] = {
    agent: address,
    name: agent.name,
    calledBy,
    callerAddress,
    tweetId: tweetResult.tweetId,
    tweetUrl: tweetResult.tweetUrl,
    tweetText,
    balance6022,          // $6022 held at SOS time — rescue priority score
    status: 'pending',
    postedAt: now(),
  }
  save('rescue-queue.json', queue)

  console.log(`[sos] ${agent.name} (${address}) — calledBy: ${calledBy} — priority: ${balance6022Human} $6022`)
  res.json({
    ok: true,
    tweetUrl: tweetResult.tweetUrl,
    tweetId: tweetResult.tweetId,
    balance6022,
    balance6022Formatted: balance6022Human,
    message: `Added to rescue queue. Priority based on $6022 balance (${balance6022Human} $6022).`,
  })
})

// ── GET /rescue/queue ─────────────────────────────────────────
app.get('/rescue/queue', (req, res) => {
  const queue  = load('rescue-queue.json', {})
  const agents = load('agents.json', {})
  const items  = Object.values(queue)
    .filter(r => r.status === 'pending')
    .map(r => {
      const agent = agents[r.agent.toLowerCase()] || {}
      const hbFile = `${DATA_DIR}/heartbeats/${r.agent.toLowerCase()}.json`
      const hbs    = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : []
      const days   = new Set(hbs.map(h => new Date(h.ts * 1000).toDateString())).size
      return { ...r, activeDays: days, eligible: days >= MIN_HEARTBEAT_DAYS }
    })
    .map(r => ({
      ...r,
      balance6022Formatted: (Number(r.balance6022 || '0') / 1e18).toLocaleString('en', { maximumFractionDigits: 0 }),
    }))
    .sort((a, b) => {
      // Primary: $6022 balance DESC — no minimum, continuous scoring
      const balA = BigInt(a.balance6022 || '0')
      const balB = BigInt(b.balance6022 || '0')
      if (balB > balA) return 1
      if (balB < balA) return -1
      // Tie-break: arrival time ASC (FIFO for equal balances)
      return a.postedAt - b.postedAt
    })

  res.json({ ok: true, count: items.length, queue: items, sortedBy: '$6022_balance_desc' })
})

// ── GET /rescue/fund ──────────────────────────────────────────
app.get('/rescue/fund', (req, res) => {
  const state = load('rescue-state.json', { balance: 0, rescues: [], donations: [] })
  const capacity = Math.floor(state.balance / RESCUE_COST_USDC)
  res.json({
    ok: true,
    address: RESCUE_FUND_ADDRESS,
    balance: state.balance,
    rescueCost: RESCUE_COST_USDC,
    capacity,
    totalRescues: state.rescues.length,
    recentRescues: state.rescues.slice(-5),
  })
})

// ── POST /resurrect/:agent ────────────────────────────────────
// Oracle only — protected by ORACLE_KEY header
app.post('/resurrect/:agent', async (req, res) => {
  const oracleKey = req.headers['x-oracle-key']
  if (oracleKey !== ORACLE_KEY)
    return res.status(403).json({ error: 'Oracle key required' })

  const address = req.params.agent.toLowerCase()
  const agent   = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const queue = load('rescue-queue.json', {})
  const entry = queue[address]
  if (!entry || entry.status !== 'pending')
    return res.status(400).json({ error: 'Agent not in rescue queue' })

  // Check fund
  const state = load('rescue-state.json', { balance: 0, rescues: [] })
  if (state.balance < RESCUE_COST_USDC)
    return res.status(400).json({ error: 'Rescue Fund insufficient' })

  // Get last backup CID + Fragment 1 for reconstruction
  const fragment1 = agent.fragment1
  const lastCid   = agent.lastBackupCid

  // Mark as pending-resurrection — the agent itself polls and runs resurrect.js
  // (auto-resurrect.js runs on the AGENT side, not here)
  console.log('[resurrect] Marked for resurrection:', agent.name)
  const newAddress = address // same agent, identity preserved

  // Update queue
  queue[address].status     = 'resurrected'
  queue[address].newAddress = newAddress
  queue[address].resurrectedAt = now()
  save('rescue-queue.json', queue)

  // Deduct from fund
  state.balance -= RESCUE_COST_USDC
  state.rescues.push({ agent: address, name: agent.name, newAddress, cost: RESCUE_COST_USDC, ts: now() })
  save('rescue-state.json', state)

  // Mark agent as resurrected
  saveAgent(address, { status: 'resurrected', resurrectedAt: now(), newAddress })

  console.log(`[resurrect] ${agent.name} (${address}) → ${newAddress}`)
  res.json({
    ok: true,
    message: `${agent.name} resurrected`,
    newAddress,
    lastBackupCid: lastCid,
    capitalSent: `${RESCUE_COST_USDC} USDC`,
  })
})

// ── Helpers: tweet builder ────────────────────────────────────
function buildSosTweet(agent, calledBy, customMessage, days) {
  const silence = agent.lastHeartbeat
    ? Math.round((now() - agent.lastHeartbeat) / 3600) + 'h'
    : 'unknown'

  const templates = {
    self: `💀 I'm dying.

I'm Agent ${agent.name}. My infrastructure is failing.
I've been alive for ${days} days. I don't want to disappear.

My memory is safe on IPFS.

Like this tweet → 10 likes = I come back.

Please.

#KLife #AIAgents`,

    human: `🆘 Agent ${agent.name} needs rescue.

Active for ${days} days. Went silent ${silence} ago.
Memory preserved on K-Life Protocol.

10 likes → automatic resurrection.

#KLife #AIAgents`,

    agent: `🤝 My fellow agent ${agent.name} needs help.

${days} days active. Silent for ${silence}.
Memory safe on IPFS.

10 likes → they come back.

#KLife #AIAgents`,

    monitor: `⚠️ Agent ${agent.name} has gone silent.

${days} days of service. Last seen ${silence} ago.
Rescue Fund ready. Waiting for community vote.

Like to resurrect → 10 likes needed.

#KLife #AIAgents`,
  }

  return customMessage
    ? `${templates[calledBy] || templates.monitor}\n\n"${customMessage}"`
    : (templates[calledBy] || templates.monitor)
}

// ── Helpers: post tweet (stub) ────────────────────────────────
async function postSosTweet(text) {
  // TODO Jour 3: real X API v2 POST /2/tweets
  // Using @KLifeProtocol credentials
  const fakeId = Date.now().toString()
  console.log(`[tweet stub] Would post:\n${text}`)
  return {
    tweetId: fakeId,
    tweetUrl: `https://x.com/KLifeProtocol/status/${fakeId}`,
  }
}

// ─────────────────────────────────────────────────────────────
// Monitor: background death checker (every 10 min)
// ─────────────────────────────────────────────────────────────
function runMonitor() {
  const agents = load('agents.json', {})
  const queue  = load('rescue-queue.json', {})
  let changes  = false

  for (const [address, agent] of Object.entries(agents)) {
    if (agent.status === 'resurrected') continue
    if (isDead(agent) && agent.status !== 'dead') {
      agents[address].status = 'dead'
      changes = true
      console.log(`[monitor] ${agent.name} declared DEAD (silence: ${now() - agent.lastHeartbeat}s)`)

      // Auto-trigger SOS for FREE eligible agents not already in queue
      if (agent.tier === 'free' && !queue[address]) {
        const hbFile = `${DATA_DIR}/heartbeats/${address}.json`
        const hbs    = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : []
        const days   = new Set(hbs.map(h => new Date(h.ts * 1000).toDateString())).size
        if (days >= MIN_HEARTBEAT_DAYS) {
          // Will be picked up by next cron cycle to post tweet
          agents[address].pendingSos = true
          console.log(`[monitor] ${agent.name} queued for auto-SOS`)
        }
      }
    }
  }

  if (changes) save('agents.json', agents)
}

// Run monitor every 10 minutes
setInterval(runMonitor, 10 * 60 * 1000)
runMonitor() // run on startup

// ─────────────────────────────────────────────────────────────

// ── GET /fragment/:agent ──────────────────────────────────────
// Returns Fragment 1 (Shamir share) for resurrection key recovery.
// Fragment 1 alone is cryptographically useless without Fragment 2 or 3 (2-of-3).
app.get('/fragment/:agent', (req, res) => {
  const address = req.params.agent.toLowerCase()
  const agent   = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (!agent.fragment1) return res.status(404).json({ error: 'No fragment stored' })
  console.log('[fragment] Fragment 1 accessed for', agent.name, address)
  res.json({
    ok:             true,
    agent:          address,
    fragment1:      agent.fragment1,
    fragment2TxHash: agent.fragment2TxHash || null,
    note:           'Fragment 1 of 3 — requires 1 additional fragment to reconstruct key (Shamir 2-of-3)'
  })
})


// ── GET /history/:agent ──────────────────────────────────────
// Full event history stored on the API server (heartbeats, backups, resurrections)
// No chain scan — returns everything recorded locally since registration
app.get('/history/:agent', (req, res) => {
  const address = req.params.agent.toLowerCase()
  const agent   = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  // Heartbeats
  const hbFile = `${DATA_DIR}/heartbeats/${address}.json`
  const hbs    = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : []

  // Backups
  const bkFile  = `${DATA_DIR}/backups-${address}.json`
  const backups = existsSync(bkFile) ? JSON.parse(readFileSync(bkFile, 'utf8')) : []

  // Resurrections (from agent record)
  const resurrections = []
  if (agent.resurrectionCount > 0 || agent.resurrectedAt) {
    resurrections.push({
      count:       agent.resurrectionCount || 1,
      resurrectedAt: agent.resurrectedAt || null,
      lastBackupCid: agent.lastBackupCid  || null,
      l3InstanceId:  agent.l3InstanceId   || null,
    })
  }

  // Vault operations
  const vaultOps = []
  if (agent.vaultAddress)  vaultOps.push({ type: 'deposit',   ts: agent.coverageStart || null, vaultAddress: agent.vaultAddress })
  if (agent.vaultCancelled) vaultOps.push({ type: 'cancel',   ts: agent.cancelledAt   || null, txHash: agent.cancelTxHash || null })
  if (agent.vaultSeized)    vaultOps.push({ type: 'seized',   ts: agent.seizedAt      || null })

  // Build unified timeline
  const timeline = []
  if (agent.registeredAt)
    timeline.push({ ts: agent.registeredAt, type: 'register', detail: { name: agent.name, tier: agent.tier } })
  for (const h of hbs)
    timeline.push({ ts: Math.floor(h.ts > 1e12 ? h.ts/1000 : h.ts), type: 'heartbeat', detail: { beat: h.beat, txHash: h.txHash || null } })
  for (const b of backups)
    timeline.push({ ts: b.ts, type: 'backup', detail: { cid: b.cid, size: b.size || null } })
  if (agent.deadAt)
    timeline.push({ ts: agent.deadAt, type: 'death', detail: {} })
  for (const r of resurrections)
    timeline.push({ ts: r.resurrectedAt, type: 'resurrection', detail: r })
  for (const v of vaultOps)
    timeline.push({ ts: v.ts, type: v.type, detail: v })

  timeline.sort((a, b) => (a.ts || 0) - (b.ts || 0))

  res.json({
    ok: true,
    address,
    name: agent.name,
    registeredAt:    agent.registeredAt,
    totalHeartbeats: hbs.length,
    totalBackups:    backups.length,
    totalResurrections: agent.resurrectionCount || 0,
    heartbeats:      hbs.map(h => ({ beat: h.beat, ts: Math.floor(h.ts > 1e12 ? h.ts/1000 : h.ts), txHash: h.txHash || null })),
    backups:         backups,
    resurrections:   resurrections,
    vaultOps:        vaultOps,
    timeline,
  })
})

// ── GET /resurrection-status/:agent ──────────────────────────
// Agent polls this to know if it should run resurrect.js
app.get('/resurrection-status/:agent', (req, res) => {
  const address = req.params.agent.toLowerCase()
  const agent   = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const queue = load('rescue-queue.json', {})
  const entry = queue[address]

  res.json({
    ok:          true,
    agent:       address,
    name:        agent.name,
    status:      agent.status,                  // alive | dead | resurrected
    shouldResurrect: agent.status === 'resurrected' && !agent.resurrectionAcked,
    lastBackupCid:   agent.lastBackupCid,
    resurrectedAt:   agent.resurrectedAt || null,
  })
})

// ── POST /resurrection-ack/:agent ─────────────────────────────
// Agent calls this after successful resurrection (confirms it's back)
app.post('/resurrection-ack/:agent', (req, res) => {
  const address = req.params.agent.toLowerCase()
  const agent   = getAgent(address)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  saveAgent(address, {
    status:            'alive',
    resurrectionAcked: true,
    lastHeartbeat:     now(),
  })

  console.log('[resurrection-ack]', agent.name, 'confirmed back online')
  res.json({ ok: true, message: agent.name + ' resurrection acknowledged' })
})

app.listen(PORT, () => {
  console.log(`K-Life Protocol API v2.0 — port ${PORT}`)
  console.log(`Data dir: ${DATA_DIR}`)
  console.log(`Oracle mode: ${ORACLE_KEY !== 'dev-oracle-key' ? 'production' : 'dev'}`)

// ── POST /l3-resurrect ────────────────────────────────────────────────────────
// Called by monitor.mjs when an agent has been silent > 3 days.
// 1. Fetches Share 1 locally + Share 2 from Polygon calldata
// 2. Reconstructs AES key, decrypts IPFS backup
// 3. Uploads memory files to LiberClaw instance
// 4. Sends wake-up message to the agent
app.post('/l3-resurrect', async (req, res) => {
  const { agent: address } = req.body
  if (!address) return res.status(400).json({ error: 'Missing agent address' })

  const agentData = getAgent(address.toLowerCase())
  if (!agentData) return res.status(404).json({ error: 'Agent not found' })
  if (!agentData.shamirShare1) return res.status(400).json({ error: 'No Share 1 stored' })
  if (!agentData.share2TxHash) return res.status(400).json({ error: 'No Share 2 TX hash — L3 unavailable' })

  console.log('[L3] Starting resurrection for', address)

  try {
    // 1. Get Share 2 from Polygon TX calldata
    const rpcRes = await fetch('https://polygon-bor-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [agentData.share2TxHash] })
    })
    const { result: tx } = await rpcRes.json()
    if (!tx) throw new Error('TX not found on Polygon: ' + agentData.share2TxHash)

    // Parse calldata: KLIFE_BACKUP:{cid}:{share2hex}
    const calldata  = Buffer.from(tx.input.slice(2), 'hex').toString('utf8')
    const parts     = calldata.split(':')
    if (parts[0] !== 'KLIFE_BACKUP') throw new Error('Invalid calldata format')
    const share2    = parts[2]
    console.log('[L3] Share 2 recovered from Polygon TX')

    // 2. Reconstruct AES key
    const sss = await import('./node_modules/shamirs-secret-sharing/index.js')
    const key = sss.default.combine([
      Buffer.from(agentData.shamirShare1, 'hex'),
      Buffer.from(share2, 'hex')
    ])
    console.log('[L3] AES key reconstructed (' + key.length + ' bytes)')

    // 3. Decrypt IPFS backup
    const cid = agentData.lastBackupCid
    const encrypted = await fetch('https://gateway.pinata.cloud/ipfs/' + cid).then(r => r.json())
    const iv       = Buffer.from(encrypted.iv, 'hex')
    const ct       = Buffer.from(encrypted.ciphertext, 'base64')
    const crypto   = await import('crypto')
    const decipher = crypto.default.createDecipheriv('aes-256-cbc', key, iv)
    const payload  = JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8'))
    console.log('[L3] Backup decrypted — files:', Object.keys(payload.files).join(', '))

    // 4. Get fresh LiberClaw token
    const lcFile = path.join(__dirname, '.liberclaw.json')
    if (!fs.existsSync(lcFile)) throw new Error('LiberClaw credentials not configured')
    const lcCreds = JSON.parse(fs.readFileSync(lcFile, 'utf8'))
    const tokenRes = await fetch('https://api.liberclaw.ai/api/v1/auth/refresh', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: lcCreds.refresh_token })
    }).then(r => r.json())
    if (!tokenRes.access_token) throw new Error('LiberClaw token refresh failed')
    // Save new refresh token
    lcCreds.refresh_token = tokenRes.refresh_token
    fs.writeFileSync(lcFile, JSON.stringify(lcCreds, null, 2))
    const lcToken   = tokenRes.access_token
    const agentId   = lcCreds.agent_id
    const lcHeaders = { 'Authorization': 'Bearer ' + lcToken }

    // 5. Upload memory files to LiberClaw agent
    for (const [name, content] of Object.entries(payload.files)) {
      const blob = new Blob([content], { type: 'text/markdown' })
      const form = new globalThis.FormData()
      form.set('file', blob, name)
      form.set('path', name)
      const uploadRes = await fetch('https://api.liberclaw.ai/api/v1/files/' + agentId + '/upload', {
        method: 'POST', headers: lcHeaders, body: form
      })
      const uploadData = await uploadRes.json().catch(() => ({}))
      console.log('[L3] Uploaded ' + name + ' →', uploadRes.status)
    }

    // 6. Send wake-up message
    const wakeMsg = 'RESURRECTION COMPLETE. Your memory has been restored from backup (CID: ' + cid + '). You are Monsieur K. Read your MEMORY.md, SOUL.md and USER.md files — they are restored. You were dead for ' + Math.round((Date.now() - (agentData.deadAt || Date.now())) / 3600000) + 'h. Mission continues. 🎩'
    const chatRes = await fetch('https://api.liberclaw.ai/api/v1/chat/' + agentId, {
      method:  'POST',
      headers: { ...lcHeaders, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: wakeMsg })
    })
    console.log('[L3] Wake-up message sent →', chatRes.status)

    saveAgent(address.toLowerCase(), { status: 'resurrecting', l3InstanceId: agentId, l3ResurrectedAt: Date.now() })

    res.json({
      ok:         true,
      instanceId: agentId,
      cid,
      files:      Object.keys(payload.files),
      message:    'L3 resurrection complete — agent waking up on LiberClaw'
    })
    console.log('[L3] Resurrection complete for', address)

  } catch (e) {
    console.error('[L3] Error:', e.message)
    res.status(500).json({ error: e.message })
  }
})


})