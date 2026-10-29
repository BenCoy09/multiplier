# Multiplier Explorer

A read-only explorer for Robinhood Chain **stock tokens** (ERC-8056). When a token's multiplier is updated, a wallet's token balance stays the same, but the underlying shares those tokens represent change. This tool shows when it happened, by how much, and what it meant for a wallet, with a link to the transaction behind every figure.

Independent project. Not affiliated with Robinhood. Shares represented = token balance × multiplier; this is not a statement about market value.

- Live app: https://multiplier-cg4g.onrender.com/app
- Demo video: VIDEO_URL_HERE
- Built for the World Is Flat hackathon, categories: stock tokens, tools and infra

## What it does

- **Home page:** a live radar of multiplier updates for SPY, NVDA, GLD, CRCL and SPCX, read from the chain, with a countdown when an update is scheduled. A replay of a real update and a calculator you can play with.
- **Explorer (`/app`):** pick a token, enter any wallet address (no wallet connection), and see the wallet's balance when the latest update took effect, the change in underlying shares, and every update with its transaction link.
- **Rooms (`/rooms`):** a live room per token. Anyone can read. Posting needs a Pro pass. Links are blocked, posts are rate limited, and three reports hide a message.

## How $WIF is used (on Robinhood Chain)

$WIF contract: `0x5173b8eA6923c2d40267890D45C46a3480954773` (as listed on worldisflat.fun).

1. The user sends $WIF to the dead address `0x000000000000000000000000000000000000dEaD` from their own wallet. The site never connects to a wallet.
2. They paste the transaction hash. The server reads the receipt on-chain and checks it is a successful transfer of at least the price from the $WIF contract to the dead address.
3. That unlocks a **Pro pass for 30 days**: the wallet's balance at *every* update (not only the latest), CSV export, Telegram alerts for the paying wallet when an update is scheduled or takes effect, and posting in the rooms.

**Flywheel:** the free tools bring people in. Pro lasts 30 days, so regular users renew, and every renewal burns more $WIF. Each burn is verified on-chain and listed on the home page with its transaction.

Real burn transactions: BURN_TX_LINKS_HERE

## How the numbers are computed

- Multiplier updates come from the on-chain event `UIMultiplierUpdated(uint256 old, uint256 new, uint256 effectiveAt)`, topic0 `0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055`. Values are 18-decimal fixed point.
- A wallet's raw balance at an update is rebuilt from `Transfer` logs up to the last block at or before `effectiveAt`. The explorer's transfer list is used only if it reconciles exactly with `balanceOf` today. Otherwise the RPC log scan is used. If neither completes, no figure is shown.
- All math uses BigInt. Shares = raw × multiplier ÷ 1e18. The page shows how each balance was obtained.

## Limits (stated, not hidden)

- Holder balances are rebuilt from transfers; same-block ordering within a block's timestamp is not resolved.
- A scheduled-update alert is possible only because the event appears before the effective time. In the two updates we checked, it was about ten minutes early. That is not guaranteed.
- Passes and rooms are stored in a file. On a host with an ephemeral disk they reset on restart.
- A holder badge shows that the wallet that paid for the pass holds that token now. It does not prove who is typing.

## Run it

Node 18 or later, no dependencies.

    node app.js            # http://localhost:3000
    node app.js verify     # prints an evidence report from the live chain

Environment variables (all optional):

| Variable | Purpose |
|---|---|
| `RPC_URL` | Robinhood Chain RPC (default: the public mainnet RPC, chain ID 4663) |
| `PRICE_WIF` | $WIF burned for a 30-day pass (default 100) |
| `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME` | Turn on Telegram alerts |
| `APP_URL` | Public URL used in alert links |
| `RPC_GAP_MS`, `TICK_MS` | Request pacing and watcher interval |

## Security

Read-only toward the chain. No private keys, no wallet permissions, no secrets in the repo. The pass is a bearer token: whoever redeems a burn hash first receives it, so redeem right after sending.
