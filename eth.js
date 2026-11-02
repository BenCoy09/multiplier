// keccak256, secp256k1 signer recovery and Ethereum personal_sign helpers. No dependencies.
const RC = [0x1n, 0x8082n, 0x800000000000808An, 0x8000000080008000n, 0x808Bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n, 0x8An, 0x88n, 0x80008009n, 0x8000000An, 0x8000808Bn, 0x800000000000008Bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800An, 0x800000008000000An, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
const ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
const M64 = (1n << 64n) - 1n, rol = (x, n) => (n ? ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64 : x);
function perm(A) {
  for (const rc of RC) {
    const C = [0, 1, 2, 3, 4].map((x) => A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4]);
    const D = [0, 1, 2, 3, 4].map((x) => C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x][y] ^= D[x];
    const B = [0, 1, 2, 3, 4].map(() => [0n, 0n, 0n, 0n, 0n]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y][(2 * x + 3 * y) % 5] = rol(A[x][y], ROT[x][y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y] & M64) & B[(x + 2) % 5][y]);
    A[0][0] ^= rc;
  }
}
function keccak256(input) {
  const buf = Buffer.from(input), rate = 136, m = Buffer.concat([buf, Buffer.alloc(rate - (buf.length % rate))]);
  m[buf.length] ^= 0x01; m[m.length - 1] ^= 0x80;
  const A = [0, 1, 2, 3, 4].map(() => [0n, 0n, 0n, 0n, 0n]);
  for (let i = 0; i < m.length; i += rate) { for (let j = 0; j < 17; j++) A[j % 5][Math.floor(j / 5)] ^= m.readBigUInt64LE(i + 8 * j); perm(A); }
  const out = Buffer.alloc(32); for (let j = 0; j < 4; j++) out.writeBigUInt64LE(A[j % 5][Math.floor(j / 5)], 8 * j);
  return out;
}
const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = [0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n];
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a, m = P) { let r0 = mod(a, m), r1 = m, s0 = 1n, s1 = 0n; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return mod(s0, m); }
function powmod(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
function dbl(p) { if (!p || p[1] === 0n) return null; const l = mod(3n * p[0] * p[0] * inv(2n * p[1])), x = mod(l * l - 2n * p[0]); return [x, mod(l * (p[0] - x) - p[1])]; }
function add(p, q) { if (!p) return q; if (!q) return p; if (p[0] === q[0]) return mod(p[1] + q[1]) === 0n ? null : dbl(p); const l = mod((q[1] - p[1]) * inv(q[0] - p[0])), x = mod(l * l - p[0] - q[0]); return [x, mod(l * (p[0] - x) - p[1])]; }
function mul(k, p) { let r = null, a = p; while (k > 0n) { if (k & 1n) r = add(r, a); a = dbl(a); k >>= 1n; } return r; }
const b32 = (n) => Buffer.from(n.toString(16).padStart(64, "0"), "hex");
const addrOf = (Q) => "0x" + keccak256(Buffer.concat([b32(Q[0]), b32(Q[1])])).subarray(12).toString("hex");
function personalHash(message) { const b = Buffer.from(message, "utf8"); return keccak256(Buffer.concat([Buffer.from("\x19Ethereum Signed Message:\n" + b.length), b])); }
function recover(message, sigHex) {
  const s = String(sigHex).replace(/^0x/, ""); if (!/^[0-9a-fA-F]{130}$/.test(s)) throw new Error("Bad signature.");
  const r = BigInt("0x" + s.slice(0, 64)), sv = BigInt("0x" + s.slice(64, 128)); let v = parseInt(s.slice(128), 16); if (v >= 27) v -= 27;
  if (v > 1 || r <= 0n || r >= N || sv <= 0n || sv >= N) throw new Error("Bad signature.");
  const y2 = mod(r * r * r + 7n); let y = powmod(y2, (P + 1n) / 4n, P); if (mod(y * y) !== y2) throw new Error("Bad signature.");
  if (Number(y & 1n) !== v) y = P - y;
  const z = BigInt("0x" + personalHash(message).toString("hex")), zG = mul(z, G), neg = zG ? [zG[0], mod(-zG[1])] : null;
  const Q = mul(inv(r, N), add(mul(sv, [r, y]), neg)); if (!Q) throw new Error("Bad signature.");
  return addrOf(Q);
}
// signing is only used by the tests
const addressFromPriv = (priv) => addrOf(mul(BigInt(priv), G));
function signMessage(message, priv) {
  const d = BigInt(priv), z = BigInt("0x" + personalHash(message).toString("hex"));
  const k = BigInt("0x" + keccak256(Buffer.concat([b32(d), b32(z)])).toString("hex")) % N, R = mul(k, G);
  let r = mod(R[0], N), s = mod(inv(k, N) * (z + r * d), N), v = Number(R[1] & 1n); if (s > N / 2n) { s = N - s; v ^= 1; }
  return "0x" + r.toString(16).padStart(64, "0") + s.toString(16).padStart(64, "0") + (27 + v).toString(16);
}
module.exports = { keccak256, recover, personalHash, addressFromPriv, signMessage };
