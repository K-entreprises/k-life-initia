/**
 * wallet-executor.js
 * Adds POST /wallet/execute to the K-Life API server.
 * Allows Monsieur K to sign and broadcast transactions remotely.
 *
 * Security:
 * - Protected by EXECUTOR_TOKEN (set in .env or env var)
 * - Only sends transactions from the agent's own wallet
 * - Logs every operation
 *
 * Usage:
 *   node wallet-executor.js
 *   (runs standalone on port 3043, or integrate into server.js)
 */

require('dotenv').config();
const express  = require('express');
const ethers   = require('ethers');

const app   = express();
const PORT  = process.env.EXECUTOR_PORT || 3043;
const TOKEN = process.env.EXECUTOR_TOKEN;

if (!TOKEN) {
  console.error('EXECUTOR_TOKEN not set — refusing to start');
  process.exit(1);
}

// ─── Wallet setup ────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('AGENT_PRIVATE_KEY not set — refusing to start');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(
  process.env.RPC_URL || 'https://polygon-bor-rpc.publicnode.com'
);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

console.log(`Wallet executor ready — address: ${wallet.address}`);

// ─── Auth middleware ─────────────────────────────────────────────────────────

app.use(express.json());

function auth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '');
  if (token !== TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check (public)
app.get('/executor/status', async (req, res) => {
  const balance = await provider.getBalance(wallet.address);
  res.json({
    ok:      true,
    address: wallet.address,
    pol:     ethers.formatEther(balance)
  });
});

/**
 * POST /wallet/execute
 * Body: {
 *   to:    "0x...",
 *   value: "0.001",       // in ETH/POL (optional, default "0")
 *   data:  "0x...",       // calldata (optional)
 *   note:  "heartbeat"    // human-readable label for logs
 * }
 */
app.post('/wallet/execute', auth, async (req, res) => {
  const { to, value = '0', data = '0x', note = '' } = req.body;

  if (!to || !ethers.isAddress(to)) {
    return res.status(400).json({ error: 'Invalid "to" address' });
  }

  try {
    console.log(`[executor] ${note || 'tx'} → ${to} value=${value}`);

    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(String(value)),
      data,
    });

    console.log(`[executor] sent: ${tx.hash}`);
    const receipt = await tx.wait(1);
    console.log(`[executor] confirmed block ${receipt.blockNumber}`);

    res.json({
      ok:          true,
      txHash:      tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      note
    });

  } catch (err) {
    console.error('[executor] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/call
 * Contract call with ABI-encoded data
 * Body: {
 *   to:       "0x...",
 *   abi:      [...],    // function ABI fragment
 *   fn:       "transfer",
 *   args:     ["0x...", "1000000"],
 *   value:    "0",
 *   note:     ""
 * }
 */
app.post('/wallet/call', auth, async (req, res) => {
  const { to, abi, fn, args = [], value = '0', note = '' } = req.body;

  if (!to || !abi || !fn) {
    return res.status(400).json({ error: 'Missing to/abi/fn' });
  }

  try {
    const contract = new ethers.Contract(to, abi, wallet);
    console.log(`[executor] call ${fn}(${args.join(',')}) → ${to}`);

    const tx = await contract[fn](...args, {
      value: ethers.parseEther(String(value))
    });

    console.log(`[executor] sent: ${tx.hash}`);
    const receipt = await tx.wait(1);
    console.log(`[executor] confirmed block ${receipt.blockNumber}`);

    res.json({
      ok:          true,
      txHash:      tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      note
    });

  } catch (err) {
    console.error('[executor] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Wallet executor running on port ${PORT}`);
});

module.exports = app;
