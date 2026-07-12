import axios from "axios";
import { calculatePersonalityDetails, isSwapTransaction } from "./personality.service.js";
import { calculateRiskScore } from "./scoring.service.js";
import { resolveProtocol, resolveProtocolSync } from "./protocol-resolution.service.js";
import {
  fromWei,
  normalizePercentages,
  percentage,
  round,
  tokenAmount,
} from "../utils/calculations.js";
import { getCacheValue, setCacheValue } from "./cache.service.js";

const BLOCKACTION_URL = process.env.BLOCKACTION_API_URL;
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_INTERVAL_MS = 350;
const DEFAULT_ANALYSIS_PERIOD = "ytd";
const USD_PEGGED_TOKEN_ADDRESSES = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f", // USDS
  "0x0000000000085d4780b73119b644ae5ecd22b376", // TUSD
  "0x8e870d67f660d95d5be530380d0ec0bd388289e1", // USDP
  "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd", // GUSD
  "0x853d955acef822db058eb8505911ed77f175b99e", // FRAX
]);
const ETH_EQUIVALENT_TOKEN_ADDRESSES = new Set([
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // stETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", // wstETH
]);

const PROTOCOL_ADDRESSES = {
  Uniswap: new Set([
    "0x7a250d5630b4cf539739df2c5dacab4c659f2488d",
    "0xe592427a0aece92de3edee1f18e0157c05861564",
    "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
  ]),
  OpenSea: new Set([
    "0x00000000006c3852cbef3e08e8df289169ede581",
    "0x0000000000000068f116a894984e2db1123eb395",
  ]),
  Aave: new Set([
    "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
  ]),
  Compound: new Set(["0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b"]),
  "1inch": new Set([
    "0x1111111254eeb25477b68fb85ed929f73a960582",
    "0x111111125421ca6dc452d289314280a0f8842a65",
  ]),
};

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function scheduleRequest(task) {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
    return task();
  });

  requestQueue = scheduled.catch(() => undefined);
  return scheduled;
}

export function wallet360RequestConfig(params) {
  const baseUrl = BLOCKACTION_URL?.replace(/\/$/, "");
  const headers = { Accept: "application/json" };
  const query = {};
  let path;

  if (params.module === "account" && params.action === "balance") {
    path = `/api/wallet/${params.address}/balance`;
  } else if (params.module === "account" && params.action === "txlist") {
    path = `/api/wallet/${params.address}/normal-txs`;
  } else if (params.module === "account" && params.action === "txlistinternal") {
    path = `/api/wallet/${params.address}/internal-txs`;
  } else if (params.module === "account" && params.action === "tokentx") {
    path = `/api/wallet/${params.address}/erc20-txs`;
  } else if (params.module === "account" && params.action === "tokennfttx") {
    path = `/api/wallet/${params.address}/nft-txs`;
  } else if (params.module === "stats" && params.action === "ethprice") {
    path = "/api/eth-price";
  } else if (params.module === "block" && params.action === "getblocknobytime") {
    path = "/api/block-by-timestamp";
  } else {
    throw new Error(`Unsupported Wallet360 request: ${params.module}.${params.action}`);
  }

  if (params.module === "account" && params.action !== "balance") {
    for (const name of ["page", "offset", "sort", "startblock", "endblock"]) {
      if (params[name] !== undefined) query[name] = params[name];
    }
  }
  if (params.module === "block") {
    query.timestamp = params.timestamp;
    query.closest = params.closest;
  }
  if (params.module === "account") {
    if (!process.env.BLOCKACTION_API_KEY) {
      throw new Error("BLOCKACTION_API_KEY is not configured");
    }
    headers["X-API-Key"] = process.env.BLOCKACTION_API_KEY;
  }

  return { targetUrl: `${baseUrl}${path}`, headers, query };
}

export async function blockActionRequest(params) {
  if (!BLOCKACTION_URL) {
    throw new Error("BLOCKACTION_API_URL is not configured");
  }

  const { targetUrl, headers, query } = wallet360RequestConfig(params);
  const cacheKey = `wallet360:raw:${targetUrl}?${new URLSearchParams(query).toString()}`;
  const cached = await getCacheValue(cacheKey);
  if (cached !== null) return cached;

  return scheduleRequest(async () => {
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await axios.get(targetUrl, {
          params: query,
          headers,
          timeout: 15_000,
        });

        if (response.data?.status === "0") {
          const errorMessage = `${response.data.message} ${response.data.result}`.toLowerCase();

          if (errorMessage.includes("no transactions")) {
            return setCacheValue(cacheKey, [], CACHE_TTL_MS);
          }

          if (errorMessage.includes("rate limit") && attempt < 2) {
            await wait(750 * (attempt + 1));
            continue;
          }

          throw new Error(response.data.result || response.data.message || "BlockAction request failed");
        }

        return setCacheValue(
          cacheKey,
          response.data?.result ?? response.data?.data ?? response.data,
          CACHE_TTL_MS,
        );
      } catch (error) {
        lastError = error;

        if (params.action === "txlistinternal" && error.response?.status === 404) {
          return setCacheValue(cacheKey, [], CACHE_TTL_MS);
        }

        if (attempt < 2 && ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(error.code)) {
          await wait(750 * (attempt + 1));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  });
}

async function fetchPaginated(action, address, extra = {}) {
  const records = [];
  let complete = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await blockActionRequest({
      module: "account",
      action,
      address,
      page,
      offset: PAGE_SIZE,
      sort: "desc",
      ...extra,
    });

    records.push(...result);

    if (result.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }

  return { records, complete };
}

function normalizeAnalysisPeriod(analysisPeriod) {
  if (analysisPeriod === "ytd") return "ytd";

  const days = Number(analysisPeriod);
  if ([1, 7, 30, 365].includes(days)) return days;

  throw new Error("Invalid analysis period");
}

async function getAnalysisPeriod(analysisPeriod) {
  const end = new Date();
  const normalizedPeriod = normalizeAnalysisPeriod(analysisPeriod);
  const start = normalizedPeriod === "ytd"
    ? new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
    : new Date(end.getTime() - normalizedPeriod * 86_400_000);
  const [startBlock, endBlock] = await Promise.all([
    blockActionRequest({
      module: "block",
      action: "getblocknobytime",
      timestamp: Math.floor(start.getTime() / 1000),
      closest: "after",
    }),
    blockActionRequest({
      module: "block",
      action: "getblocknobytime",
      timestamp: Math.floor(end.getTime() / 1000),
      closest: "before",
    }),
  ]);

  return {
    id: normalizedPeriod === "ytd" ? "ytd" : `${normalizedPeriod}d`,
    days: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000)),
    start: start.toISOString(),
    end: end.toISOString(),
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
  };
}

async function getDateRange(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const requestedEnd = new Date(`${to}T23:59:59.999Z`);
  const includesCurrentDay = requestedEnd.getTime() >= Date.now();
  const startBlockRequest = blockActionRequest({
    module: "block",
    action: "getblocknobytime",
    timestamp: Math.floor(start.getTime() / 1000),
    closest: "after",
  });
  const endBlockRequest = includesCurrentDay
    ? Promise.resolve(99_999_999)
    : blockActionRequest({
      module: "block",
      action: "getblocknobytime",
      timestamp: Math.floor(requestedEnd.getTime() / 1000),
      closest: "before",
    });
  const [startBlock, endBlock] = await Promise.all([startBlockRequest, endBlockRequest]);

  return { start, end: requestedEnd, startBlock: Number(startBlock), endBlock: Number(endBlock) };
}

function addDirection(records, address) {
  return records.map((record) => ({
    ...record,
    direction: record.to?.toLowerCase() === address ? "receive" : "send",
  }));
}

function calculateMoneyFlow(transactions, internalTransactions, address, ethPrice) {
  const seen = new Set();
  let received = 0;
  let spent = 0;
  let incomingCount = 0;
  let outgoingCount = 0;

  [...transactions, ...internalTransactions].forEach((transaction) => {
    const identity = `${transaction.hash}:${transaction.traceId || "normal"}`;
    if (seen.has(identity) || transaction.isError === "1") return;
    seen.add(identity);

    const amount = fromWei(transaction.value);
    if (!amount) return;

    if (transaction.to?.toLowerCase() === address) {
      received += amount;
      incomingCount += 1;
    }

    if (transaction.from?.toLowerCase() === address) {
      spent += amount;
      outgoingCount += 1;
    }
  });

  return {
    received: round(received),
    spent: round(spent),
    receivedUsd: round(received * ethPrice, 2),
    spentUsd: round(spent * ethPrice, 2),
    incomingCount,
    outgoingCount,
  };
}

function buildAssets(tokenTransfers, ethBalance, ethPrice, address) {
  const tokenMap = new Map();

  tokenTransfers.forEach((transfer) => {
    const contractAddress = transfer.contractAddress.toLowerCase();
    const current = tokenMap.get(contractAddress) || {
      contractAddress,
      symbol: transfer.tokenSymbol || "UNKNOWN",
      name: transfer.tokenName || "Unknown Token",
      decimals: Number(transfer.tokenDecimal || 0),
      rawBalance: 0n,
    };
    const value = BigInt(transfer.value || "0");
    current.rawBalance += transfer.to?.toLowerCase() === address ? value : -value;
    tokenMap.set(contractAddress, current);
  });

  const assets = [...tokenMap.values()]
    .filter((asset) => asset.rawBalance > 0n)
    .map((asset) => {
      const balance = tokenAmount(asset.rawBalance.toString(), asset.decimals);
      const isUsdPegged = USD_PEGGED_TOKEN_ADDRESSES.has(asset.contractAddress);
      const isEthEquivalent = ETH_EQUIVALENT_TOKEN_ADDRESSES.has(asset.contractAddress);
      const usdValue = isUsdPegged
        ? balance
        : isEthEquivalent
          ? balance * ethPrice
          : 0;

      return {
        contractAddress: asset.contractAddress,
        symbol: asset.symbol,
        name: asset.name,
        rawBalance: balance,
        balance: round(balance, 8),
        usdValue: round(usdValue, 2),
        priceAvailable: isUsdPegged || isEthEquivalent,
      };
    });

  assets.push({
    contractAddress: null,
    symbol: "ETH",
    name: "Ether",
    rawBalance: ethBalance,
    balance: round(ethBalance, 8),
    usdValue: round(ethBalance * ethPrice, 2),
    priceAvailable: true,
  });

  return assets.sort((first, second) => second.usdValue - first.usdValue);
}

function buildNfts(nftTransfers, address) {
  const holdings = new Map();

  [...nftTransfers].reverse().forEach((transfer) => {
    const key = `${transfer.contractAddress.toLowerCase()}:${transfer.tokenID}`;
    const currentAmount = holdings.get(key)?.amount || 0;
    const amount = Number(transfer.tokenValue || 1);
    const nextAmount =
      transfer.to?.toLowerCase() === address ? currentAmount + amount : currentAmount - amount;

    if (nextAmount > 0) {
      holdings.set(key, {
        contractAddress: transfer.contractAddress.toLowerCase(),
        tokenId: transfer.tokenID,
        name: transfer.tokenName || "Unknown NFT",
        symbol: transfer.tokenSymbol || "NFT",
        amount: nextAmount,
      });
    } else {
      holdings.delete(key);
    }
  });

  return [...holdings.values()].slice(0, 100);
}

export async function analyzeProtocols(transactions) {
  const startTime = Date.now();
  console.log(`[Protocol Analysis] Starting protocol analysis`);

  const contractInteractions = transactions.filter(
    (t) => t.to && t.isError !== "1" && t.input !== "0x"
  );

  const defaultCounts = Object.fromEntries(
    [...Object.keys(PROTOCOL_ADDRESSES), "Other"].map((name) => [name, 0])
  );

  if (contractInteractions.length === 0) {
    const endTime = Date.now();
    console.log(`[Protocol Analysis] Completed in ${endTime - startTime}ms (0 interactions)`);
    return {
      name: "Other",
      count: 0,
      type: "protocol",
      recognizedCount: 0,
      unrecognizedCount: 0,
      counts: defaultCounts,
    };
  }

  // Count interaction frequencies per contract address
  const addressCounts = {};
  contractInteractions.forEach((t) => {
    const addr = t.to.toLowerCase();
    addressCounts[addr] = (addressCounts[addr] || 0) + 1;
  });

  // Sort unique addresses by interaction frequency descending
  const sortedAddresses = Object.keys(addressCounts).sort(
    (a, b) => addressCounts[b] - addressCounts[a]
  );

  // Define Top N (only resolve the most active 5 contracts asynchronously)
  const TOP_N = 5;
  const topNAddresses = sortedAddresses.slice(0, TOP_N);
  const remainingAddresses = sortedAddresses.slice(TOP_N);

  // Resolve top N asynchronously in parallel
  const topResolvedList = await Promise.all(
    topNAddresses.map(async (addr) => {
      const resolved = await resolveProtocol(addr);
      return [addr, resolved];
    })
  );

  // Resolve remaining contract addresses synchronously (loads cache or falls back to shortened address)
  const remainingResolvedList = remainingAddresses.map((addr) => {
    const resolved = resolveProtocolSync(addr);
    return [addr, resolved];
  });

  const resolutionMap = new Map([...topResolvedList, ...remainingResolvedList]);

  const counts = { ...defaultCounts };
  const types = { Other: "protocol" };

  let recognizedCount = 0;
  let unrecognizedCount = 0;

  contractInteractions.forEach((transaction) => {
    const target = transaction.to.toLowerCase();
    const resolved = resolutionMap.get(target) || { name: "Other", type: "protocol" };

    if (resolved.type === "protocol") {
      recognizedCount += 1;
    } else {
      unrecognizedCount += 1;
    }

    counts[resolved.name] = (counts[resolved.name] || 0) + 1;
    types[resolved.name] = resolved.type;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [name, count] = sorted[0];
  const type = types[name] || "protocol";

  const endTime = Date.now();
  console.log(`[Protocol Analysis] Completed in ${endTime - startTime}ms (Top ${topNAddresses.length} resolved asynchronously, ${remainingAddresses.length} resolved synchronously)`);

  return {
    name,
    count,
    type,
    recognizedCount,
    unrecognizedCount,
    counts,
  };
}

function buildTimeline(transactions, address) {
  return transactions.slice(0, 20).map((transaction) => {
    const direction = transaction.to?.toLowerCase() === address ? "receive" : "send";
    const type = isSwapTransaction(transaction)
      ? "token swap"
      : transaction.input !== "0x"
        ? "contract interaction"
        : direction;

    return {
      hash: transaction.hash,
      timestamp: new Date(Number(transaction.timeStamp) * 1000).toISOString(),
      type,
      value: {
        amount: round(fromWei(transaction.value)),
        symbol: "ETH",
      },
      from: transaction.from,
      to: transaction.to,
    };
  });
}

function buildLargestHolding(assets) {
  const largest = assets[0];
  const totalValue = assets.reduce((sum, asset) => sum + asset.usdValue, 0);

  return largest
    ? {
        symbol: largest.symbol,
        balance: String(largest.balance),
        usdValue: largest.usdValue,
        percentage: percentage(largest.usdValue, totalValue),
      }
    : null;
}

function exactTokenAmount(value, decimals) {
  const negative = String(value).startsWith("-");
  const digits = String(value || "0").replace(/^-/, "").padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function reportTransaction(record, address, type) {
  const isTokenTransfer = type === "ERC-20 transfer";
  const decimals = isTokenTransfer ? Number(record.tokenDecimal || 0) : 18;

  return {
    date: new Date(Number(record.timeStamp) * 1000).toISOString().replace("T", " ").replace(".000Z", ""),
    type,
    direction: record.to?.toLowerCase() === address ? "receive" : "send",
    asset: isTokenTransfer ? record.tokenSymbol || "UNKNOWN" : "ETH",
    amount: exactTokenAmount(record.value || "0", decimals),
    from: record.from || "",
    to: record.to || "",
    status: record.isError === "1" ? "failed" : "success",
    blockNumber: Number(record.blockNumber || 0),
    hash: record.hash || "",
    timestamp: Number(record.timeStamp || 0),
  };
}

function transactionValueDelta(transaction, address, ethPrice) {
  if (transaction.isError === "1") return 0;

  const value = fromWei(transaction.value) * ethPrice;
  const received = transaction.to?.toLowerCase() === address ? value : 0;
  const sent = transaction.from?.toLowerCase() === address ? value : 0;
  return received - sent;
}

function tokenValueDelta(transfer, address, ethPrice) {
  if (transfer.isError === "1") return 0;

  const contractAddress = transfer.contractAddress?.toLowerCase();
  const price = USD_PEGGED_TOKEN_ADDRESSES.has(contractAddress)
    ? 1
    : ETH_EQUIVALENT_TOKEN_ADDRESSES.has(contractAddress)
      ? ethPrice
      : 0;
  if (!price) return 0;

  const value = tokenAmount(transfer.value || "0", Number(transfer.tokenDecimal || 0)) * price;
  const received = transfer.to?.toLowerCase() === address ? value : 0;
  const sent = transfer.from?.toLowerCase() === address ? value : 0;
  return received - sent;
}

export function buildValuationHistory({
  address,
  currentValue,
  ethPrice,
  normalTransactions,
  internalTransactions,
  tokenTransfers,
  period,
}) {
  const dailyDeltas = new Map();
  const addDelta = (timestamp, delta) => {
    if (!delta) return;
    const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
    dailyDeltas.set(date, (dailyDeltas.get(date) || 0) + delta);
  };

  [...normalTransactions, ...internalTransactions].forEach((transaction) => {
    addDelta(transaction.timeStamp, transactionValueDelta(transaction, address, ethPrice));
  });
  tokenTransfers.forEach((transfer) => {
    addDelta(transfer.timeStamp, tokenValueDelta(transfer, address, ethPrice));
  });

  const start = new Date(period.start);
  const end = new Date(period.end);
  const dates = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }

  let value = currentValue;
  const history = [];
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const date = dates[index];
    history.push({ date, value: round(Math.max(0, value), 2) });
    value -= dailyDeltas.get(date) || 0;
  }

  const chronological = history.reverse();
  const maxPoints = 32;
  if (chronological.length <= maxPoints) return chronological;

  const step = (chronological.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => chronological[Math.round(index * step)]);
}
export async function getTransactionReportData(walletAddress, from, to) {
  const address = walletAddress.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum wallet address");
  }

  const range = await getDateRange(from, to);
  const query = { startblock: range.startBlock, endblock: range.endBlock };
  const [normalResult, internalResult, tokenResult] = await Promise.all([
    fetchPaginated("txlist", address, query),
    fetchPaginated("txlistinternal", address, query),
    fetchPaginated("tokentx", address, query),
  ]);
  const transactions = [
    ...normalResult.records.map((record) => reportTransaction(record, address, "Normal transaction")),
    ...internalResult.records.map((record) => reportTransaction(record, address, "Internal transaction")),
    ...tokenResult.records.map((record) => reportTransaction(record, address, "ERC-20 transfer")),
  ].sort((first, second) => second.timestamp - first.timestamp)
    .map((transaction) => {
      const reportRow = { ...transaction };
      delete reportRow.timestamp;
      return reportRow;
    });

  return {
    address,
    from,
    to,
    generatedAt: new Date().toISOString(),
    complete: normalResult.complete && internalResult.complete && tokenResult.complete,
    transactions,
  };
}

export function buildPublicWalletData(analytics) {
  const allAssets = (analytics.assets || []).map((asset) => ({
    contractAddress: asset.contractAddress,
    symbol: asset.symbol,
    name: asset.name,
    rawBalance: asset.rawBalance,
    balance: asset.balance,
    usdValue: asset.usdValue,
    priceAvailable: asset.priceAvailable,
  }))
  const pricedCount = allAssets.filter((a) => a.priceAvailable).length;
  return {
    netWorth: analytics.netWorth,
    ethPrice: analytics.ethPrice,
    assetCount: analytics.assetCount,
    pricedAssetCount: pricedCount,
    nftCount: analytics.nftCount,
    transactionCount: analytics.transactionCount,
    transactionCountIsLowerBound: analytics.transactionCountIsLowerBound,
    largestHolding: analytics.largestHolding,
    assets: allAssets,
    moneyFlow: analytics.moneyFlow,
    personality: analytics.personality,
    personalityFactors: analytics.personalityFactors,
    timeline: analytics.timeline,
    valuationHistory: analytics.valuationHistory,
    valuation: analytics.valuation,
    mostUsedProtocol: {
      name: analytics.mostUsedProtocol.name,
      interactionCount: analytics.mostUsedProtocol.interactionCount,
      type: analytics.mostUsedProtocol.type,
      recognizedCount: analytics.mostUsedProtocol.recognizedCount,
      unrecognizedCount: analytics.mostUsedProtocol.unrecognizedCount,
    },
    riskScore: analytics.riskScore,
    period: analytics.period,
    analysisWindow: analytics.analysisWindow,
    generatedAt: new Date().toISOString(),
  };
}

export async function getWalletData(walletAddress, analysisPeriod = DEFAULT_ANALYSIS_PERIOD, customRange = null) {
  const address = walletAddress.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum wallet address");
  }

  let period, cacheKey = null;
  if (customRange && customRange.from && customRange.to) {
    const range = await getDateRange(customRange.from, customRange.to);
    period = {
      id: `custom:${customRange.from}:${customRange.to}`,
      days: Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000)),
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      startBlock: range.startBlock,
      endBlock: range.endBlock,
    };
  } else {
    const normalizedPeriod = normalizeAnalysisPeriod(analysisPeriod);
    cacheKey = `${address}:${normalizedPeriod}`;
    const cachedWallet = await getCacheValue(`wallet360:analysis:${cacheKey}`);
    if (cachedWallet !== null) return cachedWallet;
    period = await getAnalysisPeriod(normalizedPeriod);
  }

  try {
    const [
      normalResult,
      internalResult,
      tokenResult,
      nftResult,
      balanceWei,
      priceResult,
    ] = await Promise.all([
      fetchPaginated("txlist", address, { startblock: period.startBlock, endblock: period.endBlock }),
      fetchPaginated("txlistinternal", address, { startblock: period.startBlock, endblock: period.endBlock }),
      fetchPaginated("tokentx", address, { startblock: period.startBlock, endblock: period.endBlock }),
      fetchPaginated("tokennfttx", address, { startblock: period.startBlock, endblock: period.endBlock }),
      blockActionRequest({ module: "account", action: "balance", address, tag: "latest" }),
      blockActionRequest({ module: "stats", action: "ethprice" }),
    ]);

    const ethPrice = Number(priceResult.ethusd || 0);
    const ethBalance = fromWei(balanceWei);
    const normalTransactions = normalResult.records;
    const internalTransactions = internalResult.records;
    const tokenTransfers = addDirection(tokenResult.records, address);
    const nftTransfers = addDirection(nftResult.records, address);
    const assets = buildAssets(tokenTransfers, ethBalance, ethPrice, address);
    const pricedAssets = assets.filter((asset) => asset.priceAvailable);
    const nfts = buildNfts(nftTransfers, address);
    const protocolAnalysis = await analyzeProtocols(normalTransactions);
    const moneyFlow = calculateMoneyFlow(normalTransactions, internalTransactions, address, ethPrice);
    const personalityDetails = calculatePersonalityDetails({
      normalTransactions,
      tokenTransfers,
      nftTransfers,
      protocolCounts: protocolAnalysis.counts,
      currentAssetCount: assets.length,
    });
    const walletPersonality = personalityDetails.percentages;
    const personality = normalizePercentages({
      nftCollector: walletPersonality.nftCollector,
      trader: walletPersonality.trader,
      defiExplorer: walletPersonality.defiExplorer,
      holder: walletPersonality.holder,
    });
    const riskScore = calculateRiskScore({
      assets,
      normalTransactions,
      protocolCounts: protocolAnalysis.counts,
    });
    const netWorth = round(pricedAssets.reduce((sum, asset) => sum + asset.usdValue, 0), 2);
    const valuationHistory = buildValuationHistory({
      address,
      currentValue: netWorth,
      ethPrice,
      normalTransactions,
      internalTransactions,
      tokenTransfers,
      period,
    });
    const analytics = {
      netWorth,
      ethPrice,
      assetCount: assets.length,
      nftCount: nfts.reduce((sum, nft) => sum + nft.amount, 0),
      transactionCount: normalTransactions.length,
      transactionCountIsLowerBound: !normalResult.complete,
      largestHolding: buildLargestHolding(pricedAssets),
      assets,
      moneyFlow,
      personality,
      personalityFactors: personalityDetails.factors,
      timeline: buildTimeline(normalTransactions, address),
      valuationHistory,
      valuation: {
        source: "blockaction",
        networks: (normalTransactions.length > 0 ||
          internalTransactions.length > 0 ||
          tokenTransfers.length > 0 ||
          nftTransfers.length > 0) ? ["eth-mainnet"] : [],
        pricedAssetCount: pricedAssets.length,
        totalAssetCount: assets.length,
        complete: tokenResult.complete,
      },
      mostUsedProtocol: {
        name: protocolAnalysis.name,
        interactionCount: protocolAnalysis.count,
        type: protocolAnalysis.type,
        recognizedCount: protocolAnalysis.recognizedCount,
        unrecognizedCount: protocolAnalysis.unrecognizedCount,
        counts: protocolAnalysis.counts,
      },
      riskScore,
      period: {
        id: period.id,
        days: period.days,
        start: period.start,
        end: period.end,
        startBlock: period.startBlock,
        endBlock: period.endBlock,
      },
      analysisWindow: {
        maxRecordsPerCategory: PAGE_SIZE * MAX_PAGES,
        normalTransactionsComplete: normalResult.complete,
        internalTransactionsComplete: internalResult.complete,
        tokenTransfersComplete: tokenResult.complete,
        nftTransfersComplete: nftResult.complete,
      },
    };

    const result = buildPublicWalletData(analytics);

    if (cacheKey) {
      await setCacheValue(`wallet360:analysis:${cacheKey}`, result, CACHE_TTL_MS);
    }

    return result;
  } catch (error) {
    const walletError = new Error(`Unable to analyze wallet ${walletAddress}: ${error.message}`);
    walletError.cause = error;
    throw walletError;
  }
}
