const https = require("https");
const WALLET = "0x8B3ea7e8eC53596A70019445907645838E945b7a";

const data = JSON.stringify({ walletAddress: WALLET, network: "amoy" });
const req = https.request({
  hostname: "faucet.polygon.technology", port: 443, path: "/api", method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": data.length }
}, res => {
  let body = "";
  res.on("data", c => body += c);
  res.on("end", () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(body);
    if (res.statusCode === 200) console.log("✅ Tokens requested — attend 1-2 min");
    else console.log("❌ Essaie: https://faucet.polygon.technology/");
  });
});
req.on("error", e => console.log("Erreur:", e.message));
req.write(data);
req.end();
