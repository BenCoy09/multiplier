# Multiplier Explorer

A read-only explorer for Robinhood Chain **stock tokens** (ERC-8056). When a token's multiplier is updated, the token balance in a wallet stays the same, but the real shares those tokens stand for change. Wallets don't explain this. This tool shows when it happened, by how much, and what it meant for any wallet, with a link to the transaction behind every figure.

Independent project, not affiliated with Robinhood. Shares represented = token balance × multiplier; this is not a statement about market value.

- Live app: https://multiplier-cg4g.onrender.com
- For judges (test steps, live status, verified burns): https://multiplier-cg4g.onrender.com/judges
- Demo video: VIDEO_URL_HERE
- Built for the World Is Flat hackathon. Categories: stock tokens, tools and infra

## What it does

- **Home:** a live radar of multiplier updates for SPY, NVDA, GLD, CRCL and SPCX, read from the chain, with a countdown when an update is scheduled. A 3D ring explainer, a replay of a real update, and a calculator.
- **Explorer (`/app`):** pick a token, enter any wallet address (no wallet needed), and see "Today: N tokens = about M real shares", the balance when the latest update took effect, and every update with its transaction link.
- **All tokens:** one wallet across SPY, NVDA, GLD, CRCL and SPCX: raw tokens, real shares, last update and next scheduled update.
- **For builders (`/builders`):** the exact ways Stock Tokens break in other apps, copy-paste patterns, and an open API (`/api/radar`, `/api/lookup`, `/api/portfolio`; GET, no key, CORS enabled).
- **Rooms (`/rooms`):** a live room per token. Anyone can read. Posting needs a Pro pass and a username. Links are blocked, posts are rate limited, and three reports hide a message.
- **Telegram alerts:** a bot tells a wallet's owner when an update is scheduled and when it takes effect, only for tokens that wallet holds. It also answers `/status`, `/wallets`, `/radar`, `/holdings` and `/lookup <wallet> <token>`, and remembers which chat is linked to which pass, so `/start` shows your status after a restart.

## How $WIF is used (on Robinhood Chain)

$WIF contract: `0x5173b8eA6923c2d40267890D45C46a3480954773` (as listed on worldisflat.fun).

1. **Burn for a 30-day Pro pass.** Send $WIF to the dead address `0x000000000000000000000000000000000000dEaD`. Either connect a browser wallet and pay in one click, or send it yourself and paste the transaction hash. The server verifies the burn on-chain. **A free signature from the paying wallet is also required:** you sign a message that contains the transaction hash, and the server checks that the signer is the wallet that sent the burn. A copied transaction hash is useless to anyone else, and each hash can be claimed only once.
2. **More wallets:** each extra watched wallet (up to 5 per pass) is another burn, claimed with the same free signature. **Add wallet** stays available while Pro is active.
3. **Renewals:** burn again to extend the same pass, also with a free signature from the paying wallet. **Renew** stays available while Pro is active and after it expires. The bot reminds you 3 days before a pass ends.

Pro unlocks the wallet's balance at *every* update, CSV export, Telegram alerts, and posting in the rooms.

**Flywheel:** the free tools bring people in, alerts and rooms give them a reason to stay, and passes expire after 30 days, so regular users renew. Every burn is verified on-chain and listed on the judges page.

Real burn transactions: BURN_TX_LINKS_HERE

## How the numbers are computed

- Updates come from the on-chain event `UIMultiplierUpdated(uint256 old, uint256 new, uint256 effectiveAt)`, topic0 `0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055`. Values are 18-decimal fixed point.
- A wallet's raw balance at an update is rebuilt from `Transfer` logs up to the last block at or before `effectiveAt`. The explorer's transfer list is used only if it reconciles exactly with `balanceOf` today. If nothing completes, no figure is shown.
- All math uses BigInt. Shares = raw × multiplier ÷ 1e18.

## Wallet connection (optional)

Looking up any wallet needs no connection. Connecting is only for paying and signing in. It uses standard browser-wallet APIs (EIP-6963 discovery, EIP-1193). The site only ever asks for (1) a free signature that proves you own the address, (2) a plain `transfer` of $WIF to the dead address, which you confirm in your wallet, and (3) a second free signature over a message that contains that burn's transaction hash, which proves the burn is yours. It never asks for token approvals. The signature is verified on the server with a hand-written secp256k1 recovery (`eth.js`, no dependencies).

## Limits (stated, not hidden)

- Same-block ordering within a block's timestamp is not resolved when rebuilding balances.
- Alerts depend on the update event appearing before it takes effect. In the two updates we checked it was about ten minutes early. That is not guaranteed, and updates are rare.
- A holder badge shows that the wallet that paid for the pass holds that token now. It does not prove who is typing.
- Without the optional external store, passes and rooms reset on a restart.
- QR-code wallets (WalletConnect) are not supported yet.
- Burns sent from a smart-contract wallet cannot be claimed, because they cannot produce the required signature. Burn from a normal wallet.

## Run it

Node 18 or later, no dependencies.

    node app.js            # http://localhost:3000
    node app.js verify     # prints an evidence report from the live chain

| Variable | Purpose |
|---|---|
| `RPC_URL` | Robinhood Chain RPC (default: the public mainnet RPC, chain ID 4663) |
| `PRICE_WIF`, `PRICE_WALLET_WIF` | $WIF burned for a pass, and per extra wallet |
| `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME` | Turn on Telegram alerts |
| `APP_URL` | Public URL used in alert links |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional persistent store |
| `SESSION_SECRET` | Optional. Keeps signature messages valid across a restart. A random one is used if unset |
| `RPC_GAP_MS`, `TICK_MS` | Request pacing and watcher interval |

## Security

No private keys, no secrets in the repo, no token approvals. Claiming a burn needs a free signature from the wallet that sent it, so anyone who sees the transaction hash cannot take the pass. The pass is a bearer token stored in the browser; signing in with the wallet that paid restores it, including after it has expired.
