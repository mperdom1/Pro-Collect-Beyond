var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
var corsOrigin = process.env.CORS_ORIGIN || "*";
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", corsOrigin);
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(import_express.default.json({ limit: "20mb" }));
var ai = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});
app.post("/api/extract", async (req, res) => {
  console.log("POST /api/extract request received");
  const { textContent, fileData, mimeType } = req.body;
  console.log("Body metadata:", {
    hasText: !!textContent,
    hasFile: !!fileData,
    mimeType,
    textLength: textContent?.length || 0,
    fileLength: fileData?.length || 0
  });
  try {
    const contents = [];
    if (fileData && mimeType === "application/pdf") {
      contents.push({
        inlineData: {
          data: fileData,
          mimeType
        }
      });
      contents.push({
        text: `Extract the structured data from this PDF report (ProCollect Services LLC). 
        Identify if it is a "Daily Collector Summary" (DAILY) or "Daily Collector MTD Summary" (MTD).
        
        CRITICAL: Extract the date (e.g., "04/24/2026") from the report header and put it in "reportDate".
        
        MTD REPORT STRUCTURE (Per Collector Block):
        1. Collector Header: Identifies the collector (e.g., "01", "02", "LG") and lists the primary amounts: [Payment Amount, Paid Principal, Interest, Fixed Fees, Court Costs, Attorney Fees].
        2. Sub-Row "Number of payments": Provides the count (e.g., 5) and often sub-commissions (Commission Prin, Commission Int).
        3. Sub-Row "Amount Withheld": Lists amounts withheld from this collector's payout.
        4. Sub-Row "Total Fees": Critical for identifying the exact agency fees. This value is usually the sum of commissions from the sub-rows.
        
        DATA MAPPING:
        - collectorNumber: The code (e.g., "01", "16", "LG").
        - numberOfPayments: The integer count found next to "Number of payments".
        - paymentAmount: The gross amount listed in the first row.
        - commissionPrin: Extract the value for "Commission Prin." from the "Number of payments" sub-row.
        - commissionInt: Extract the value for "Commission Int." from the "Number of payments" sub-row.
        - totalFees: Use the specific value from the "Total Fees" sub-row (usually under the first column).
        - amountWithheld: Sum of any values on the "Amount Withheld" sub-row.
        
        Return the data in a clean JSON format with reportType, collectors, reportDate, and reportTime.`
      });
    } else {
      contents.push({
        text: `Extract structured data from this ProCollect Services LLC collection report text.
        
        CRITICAL: Extract the date (e.g., "04/24/2026") from the beginning of the text and put it in "reportDate".
        
        The text comes from a PDF where tables are flattened. Use the following logic to reconstruct:
        1. Collector ID: Usually followed or preceded by "Collector Number".
        2. Master Row: A sequence of numbers for [Payment, Principal, Interest, Fixed, Court, Atty].
        3. Sub-Rows: Look for "Number of payments" (integer), "Commission Prin.", "Commission Int.", "Amount Withheld" (sum any values in this row), and "Total Fees" (the final agency fee).
        
        Text:
        ${textContent}`
      });
    }
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: contents }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            reportType: { type: import_genai.Type.STRING, enum: ["DAILY", "MTD"] },
            collectors: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  collectorNumber: { type: import_genai.Type.STRING },
                  numberOfPayments: { type: import_genai.Type.INTEGER },
                  paymentAmount: { type: import_genai.Type.NUMBER },
                  paidPrincipal: { type: import_genai.Type.NUMBER },
                  interest: { type: import_genai.Type.NUMBER },
                  commissionPrin: { type: import_genai.Type.NUMBER },
                  commissionInt: { type: import_genai.Type.NUMBER },
                  totalFees: { type: import_genai.Type.NUMBER },
                  amountWithheld: { type: import_genai.Type.NUMBER }
                },
                required: ["collectorNumber"]
              }
            },
            reportDate: { type: import_genai.Type.STRING, description: "The date of the report, e.g., 04/24/2026" },
            reportTime: { type: import_genai.Type.STRING, description: "The time of the report if available" }
          }
        }
      }
    });
    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error) {
    console.error("Extraction error:", error);
    if (error.status === "RESOURCE_EXHAUSTED" || error.message?.includes("QUOTA")) {
      return res.status(429).json({ error: "L\xEDmite de cuota alcanzado. Por favor espera 30 segundos antes de reintentar." });
    }
    res.status(500).json({ error: error.message || "Failed to extract data" });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      console.log(`Catch-all route hit for: ${req.url}`);
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
