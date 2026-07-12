import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicWalletData,
  buildValuationHistory,
  wallet360RequestConfig,
} from "./blockaction.service.js";

test("maps account requests to authenticated Wallet360 REST endpoints", () => {
  const previousKey = process.env.BLOCKACTION_API_KEY;
  process.env.BLOCKACTION_API_KEY = "test-key";
  const config = wallet360RequestConfig({
    module: "account",
    action: "tokentx",
    address: "0xabc",
    page: 2,
    offset: 1000,
    sort: "desc",
    startblock: 10,
    endblock: 20,
  });
  if (previousKey === undefined) delete process.env.BLOCKACTION_API_KEY;
  else process.env.BLOCKACTION_API_KEY = previousKey;

  assert.equal(config.targetUrl.endsWith("/api/wallet/0xabc/erc20-txs"), true);
  assert.equal(config.headers["X-API-Key"], "test-key");
  assert.deepEqual(config.query, {
    page: 2,
    offset: 1000,
    sort: "desc",
    startblock: 10,
    endblock: 20,
  });
});

test("maps public Wallet360 endpoints without API credentials", () => {
  const config = wallet360RequestConfig({
    module: "block",
    action: "getblocknobytime",
    timestamp: 123,
    closest: "after",
  });
  assert.equal(config.targetUrl.endsWith("/api/block-by-timestamp"), true);
  assert.equal("X-API-Key" in config.headers, false);
  assert.deepEqual(config.query, { timestamp: 123, closest: "after" });
});

test("builds dated current-price value estimates from wallet flows", () => {
  const history = buildValuationHistory({
    address: "0xwallet",
    currentValue: 115,
    ethPrice: 1,
    normalTransactions: [{
      from: "0xsender",
      to: "0xwallet",
      value: "10000000000000000000",
      timeStamp: String(Date.parse("2026-06-02T12:00:00Z") / 1000),
    }],
    internalTransactions: [],
    tokenTransfers: [{
      contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      from: "0xsender",
      to: "0xwallet",
      tokenDecimal: "6",
      value: "5000000",
      timeStamp: String(Date.parse("2026-06-02T13:00:00Z") / 1000),
    }],
    period: {
      start: "2026-06-01T00:00:00.000Z",
      end: "2026-06-03T00:00:00.000Z",
    },
  });

  assert.deepEqual(history, [
    { date: "2026-06-01", value: 100 },
    { date: "2026-06-02", value: 115 },
    { date: "2026-06-03", value: 115 },
  ]);
});

test("wallet API response excludes large internal collections", () => {
  const response = buildPublicWalletData({
    netWorth: 12,
    assetCount: 2,
    nftCount: 3,
    transactionCount: 5,
    transactionCountIsLowerBound: false,
    largestHolding: null,
    moneyFlow: {},
    personality: {},
    personalityFactors: {},
    timeline: [],
    valuationHistory: [{ date: "2026-06-01", value: 12 }],
    valuation: { totalAssetCount: 2 },
    mostUsedProtocol: {
      name: "Other",
      interactionCount: 1,
      type: "protocol",
      recognizedCount: 0,
      unrecognizedCount: 1,
      counts: { Other: 1 }
    },
    riskScore: {},
    period: { id: "30d", days: 30 },
    analysisWindow: {},
  });

  assert.equal(response.assetCount, 2);
  assert.equal(response.mostUsedProtocol.name, "Other");
  assert.equal(response.mostUsedProtocol.type, "protocol");
  assert.equal(response.mostUsedProtocol.recognizedCount, 0);
  assert.equal(response.mostUsedProtocol.unrecognizedCount, 1);
  assert.deepEqual(response.valuationHistory, [{ date: "2026-06-01", value: 12 }]);
  assert.equal(typeof response.generatedAt, "string");
  assert.equal("assets" in response, true);
  assert.equal("nfts" in response, false);
  assert.equal("topAssets" in response, false);
  assert.equal("topNfts" in response, false);
  assert.equal("counts" in response.mostUsedProtocol, false);
});
