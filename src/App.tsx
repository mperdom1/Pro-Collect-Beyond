import { useState, useRef, type ChangeEvent } from "react";
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Table as TableIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cn } from "@/src/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface CollectorData {
  collectorNumber: string;
  numberOfPayments: number;
  paymentAmount: number;
  paidPrincipal: number;
  interest: number;
  commissionPrin?: number;
  commissionInt?: number;
  totalFees: number;
  amountWithheld: number;
}

interface ExtractedReport {
  reportType: "DAILY" | "MTD";
  collectors: CollectorData[];
  reportDate?: string;
  reportTime?: string;
}

const currencyRegex = /\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g;

function parseMoney(value: string | undefined) {
  if (!value) return 0;
  return Number(value.replace(/[$,]/g, "")) || 0;
}

function extractFirstDate(text: string) {
  return text.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] || "";
}

function extractTime(text: string) {
  return text.match(/\b\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\b/i)?.[0] || "";
}

function parseCollectorBlock(block: string): CollectorData | null {
  const collectorNumber = block.match(/\b([A-Z0-9]{1,4})\s+Collector Number\b/i)?.[1] || "";
  if (!collectorNumber) return null;

  const firstLine = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes("Collector Number")) || "";

  const firstLineAmounts = firstLine.match(currencyRegex) || [];

  const numberOfPaymentsLine = block.match(/Number of payments[^\n]*/i)?.[0] || "";
  const numberOfPaymentsMatch = numberOfPaymentsLine.match(/(\d+)\s*$/);
  const numberOfPayments = Number(numberOfPaymentsMatch?.[1] || 0);
  const commissionValues = numberOfPaymentsLine.match(currencyRegex) || [];

  const totalFeesMatch = block.match(/(\$?\d{1,3}(?:,\d{3})*(?:\.\d{2}))\s+Total Fees/i);

  let amountWithheld = 0;
  const withheldSectionMatch = block.match(/Amount Withheld([\s\S]*)/i);
  if (withheldSectionMatch?.[1]) {
    const withheldValues = withheldSectionMatch[1].match(currencyRegex) || [];
    amountWithheld = withheldValues
      .map(parseMoney)
      .reduce((max, n) => (n > max ? n : max), 0);
  }

  return {
    collectorNumber,
    numberOfPayments,
    paymentAmount: parseMoney(firstLineAmounts[0]),
    paidPrincipal: parseMoney(firstLineAmounts[1]),
    interest: parseMoney(firstLineAmounts[2]),
    commissionPrin: parseMoney(commissionValues[0]),
    commissionInt: parseMoney(commissionValues[1]),
    totalFees: parseMoney(totalFeesMatch?.[1]),
    amountWithheld,
  };
}

function parseProCollectText(text: string): ExtractedReport {
  const normalizedText = text.replace(/\r/g, "");
  const reportType: "DAILY" | "MTD" = /MTD|Month\s*To\s*Date/i.test(normalizedText) ? "MTD" : "DAILY";
  const blocks = normalizedText
    .split(/--+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const collectors = blocks
    .map(parseCollectorBlock)
    .filter((collector): collector is CollectorData => Boolean(collector));

  return {
    reportType,
    collectors,
    reportDate: extractFirstDate(normalizedText),
    reportTime: extractTime(normalizedText),
  };
}

export default function App() {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const extractEndpoint = `${apiBaseUrl}/api/extract`;
  // Lambda Function URL buffered payload limit is ~6 MB. Base64 adds ~33% overhead,
  // plus JSON wrapper, so keep a conservative raw file cap.
  const maxPdfSizeBytes = 3.8 * 1024 * 1024;
  const maxRequestBodyBytes = 5_500_000;

  const [inputText, setInputText] = useState("");
  const [data, setData] = useState<ExtractedReport | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"DAILY" | "MTD">("DAILY");
  const [uploadedFile, setUploadedFile] = useState<{ name: string, base64: string, type: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeCollectors = Array.isArray(data?.collectors) ? data.collectors : [];
  const stats = data ? {
    collectorsCount: safeCollectors.length,
    paymentsCount: safeCollectors.reduce((acc, c) => acc + (c.numberOfPayments || 0), 0),
    grossAmount: safeCollectors.reduce((acc, c) => acc + (c.paymentAmount || 0), 0),
    totalFees: safeCollectors.reduce((acc, c) => acc + (c.totalFees || 0), 0),
    withheld: safeCollectors.reduce((acc, c) => acc + (c.amountWithheld || 0), 0)
  } : null;

  const extractTextFromPdf = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(pageText);
    }

    return pages.join("\n").trim();
  };

  const handleExtract = async () => {
    if (!inputText.trim() && !uploadedFile) return;

    if (inputText.trim()) {
      const localResult = parseProCollectText(inputText);
      if (localResult.collectors.length > 0) {
        setData(localResult);
        setActiveTab(localResult.reportType);
        setError(null);
        setInfoMessage("Processed locally without AI.");
        return;
      }
    }

    const requestPayload = {
      textContent: inputText,
      fileData: uploadedFile?.base64,
      mimeType: uploadedFile?.type,
    };
    const estimatedBodySize = JSON.stringify(requestPayload).length;

    if (estimatedBodySize > maxRequestBodyBytes) {
      setError(
        "File too large for current serverless request limit. Use a smaller PDF or paste extracted text."
      );
      return;
    }
    
    setIsExtracting(true);
    setError(null);
    setInfoMessage(null);
    
    try {
      const response = await fetch(extractEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received:", text.slice(0, 500));
        if (response.status === 404) {
          throw new Error(
            apiBaseUrl
              ? `API endpoint not found at ${extractEndpoint}. Verify your deployed backend route /api/extract.`
              : "API endpoint /api/extract was not found. In Amplify static hosting, configure VITE_API_BASE_URL to point to your deployed backend."
          );
        }
        throw new Error(`Server returned non-JSON response (${response.status}). The payload might be too large or the server encountered an error.`);
      }

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to extract data");
      }

      if (result?.ok === true && result?.message && !result?.collectors) {
        throw new Error(
          "Backend is in test mode. Replace the Lambda test response with real extraction logic for /api/extract."
        );
      }

      if (!Array.isArray(result?.collectors)) {
        throw new Error("Invalid API response: expected collectors array.");
      }

      const normalizedResult: ExtractedReport = {
        reportType: result?.reportType === "MTD" ? "MTD" : "DAILY",
        collectors: result.collectors,
        reportDate: result?.reportDate,
        reportTime: result?.reportTime,
      };
      
      setData(normalizedResult);
      if (normalizedResult.reportType) {
        setActiveTab(normalizedResult.reportType);
      }
    } catch (err: any) {
      const message = err?.message || "Failed to extract data";
      if (inputText.trim()) {
        const localResult = parseProCollectText(inputText);
        if (localResult.collectors.length > 0) {
          setData(localResult);
          setActiveTab(localResult.reportType);
          setError(null);
          setInfoMessage("AI unavailable; processed locally without AI.");
          return;
        }
      }
      if (message.includes("Failed to fetch")) {
        setError(
          "Network/CORS error or payload too large. If you uploaded a PDF, try a smaller file (Lambda URL has strict payload limits) or paste extracted text."
        );
      } else {
        setError(message);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setInfoMessage(null);

    if (file.type === "application/pdf") {
      setIsPreparingFile(true);
      try {
        if (file.size > maxPdfSizeBytes) {
          const extractedText = await extractTextFromPdf(file);
          if (!extractedText) {
            throw new Error("No readable text found in the PDF.");
          }
          setUploadedFile(null);
          setInputText(extractedText);
          setInfoMessage("Large PDF detected: converted to text automatically for serverless processing.");
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(",")[1];
            setUploadedFile({
              name: file.name,
              base64: base64,
              type: file.type
            });
            setInputText(""); // Clear text if PDF is uploaded
          };
          reader.readAsDataURL(file);
        }
      } catch (err: any) {
        setUploadedFile(null);
        setInputText("");
        setError(err?.message || "Could not read PDF. Try another file or paste text.");
      } finally {
        setIsPreparingFile(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setInputText(text);
        setUploadedFile(null);
      };
      reader.readAsText(file);
    }
  };

  const handleExport = () => {
    if (!data || data.collectors.length === 0) return;
    
    // Flatten data for Excel
    const exportData = data.collectors.map(c => ({
      "Date": data.reportDate || "",
      "Collector #": c.collectorNumber,
      "Payments": c.numberOfPayments,
      "Payment Amt": c.paymentAmount,
      "Principal": c.paidPrincipal,
      "Interest": c.interest,
      "Comm. Prin": c.commissionPrin || 0,
      "Comm. Int": c.commissionInt || 0,
      "Total Fees": c.totalFees,
      "Amount Withheld": c.amountWithheld
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Collector Summary");
    XLSX.writeFile(wb, `Collector_${data.reportType}_${data.reportDate || "Report"}.xlsx`);
  };

  const clearData = () => {
    setInputText("");
    setUploadedFile(null);
    setData(null);
    setError(null);
    setInfoMessage(null);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Navbar */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">
            ProCollect <span className="text-blue-600">Parser</span>
          </span>
          <div className="h-6 w-px bg-slate-200 mx-4" />
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab("DAILY")}
              className={cn(
                "px-4 py-1 text-xs font-bold rounded-md transition-all",
                activeTab === "DAILY" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              DAILY
            </button>
            <button 
              onClick={() => setActiveTab("MTD")}
              className={cn(
                "px-4 py-1 text-xs font-bold rounded-md transition-all",
                activeTab === "MTD" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              MTD SUMMARY
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm border border-slate-200 transition-colors"
          >
            <Upload size={16} /> 
            {uploadedFile ? uploadedFile.name : "Upload PDF/Text"}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".txt,.csv,.pdf" 
              onChange={handleFileUpload} 
            />
          </button>
          <button 
            onClick={handleExport}
            disabled={!data}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm shadow-sm transition-all",
              data 
                ? "bg-green-600 hover:bg-green-700 text-white shadow-green-200" 
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            <Download size={16} /> 
            Export to Excel
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Current Session</h3>
            <p className="text-xl font-bold text-slate-900 leading-tight">
              {data ? (data.reportType === "MTD" ? "Month To Date Summary" : "Daily Summary") : "No Active Report"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {data ? (
                <>
                  <span className="font-bold text-blue-600">{data.reportType}</span>
                  {data.reportDate && ` • ${data.reportDate}`}
                  {data.reportTime && ` • ${data.reportTime}`}
                </>
              ) : "Waiting for input..."}
            </p>
          </section>

          <section className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-4">Summary Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">Collectors</span>
                <span className="text-sm font-bold">{stats?.collectorsCount || "--"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">Total Payments</span>
                <span className="text-sm font-bold">{stats?.paymentsCount || "--"}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 mt-3">
                <span className="text-sm text-slate-600">Gross Collected</span>
                <span className="text-sm font-bold text-blue-600">
                  {stats ? `$${stats.grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">Agency Fees</span>
                <span className="text-sm font-bold text-red-500">
                  {stats ? `$${stats.totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">Net Withheld</span>
                <span className="text-sm font-bold text-slate-900">
                  {stats ? `$${stats.withheld.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--"}
                </span>
              </div>
            </div>
          </section>

          <div className="mt-auto p-4 bg-blue-50 border border-blue-100 rounded-lg text-[11px] leading-relaxed text-blue-800">
            <span className="font-bold block mb-1">PRO TIP:</span>
            Switch between DAILY and MTD modes at the top. The system will automatically detect the report type from your text paste.
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-hidden flex flex-col min-w-0">
          <header className="mb-6 flex justify-between items-end shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {activeTab} Summary Parsing
              </h2>
              <p className="text-sm text-slate-500">Paste your raw text content below</p>
            </div>
            <div className="flex items-center gap-3">
              {inputText && (
                <button 
                  onClick={clearData}
                  className="text-slate-400 hover:text-red-500 transition-colors p-2"
                  title="Clear content"
                >
                  <Trash2 size={20} />
                </button>
              )}
              <button
                onClick={handleExtract}
                disabled={isExtracting || isPreparingFile || (!inputText.trim() && !uploadedFile)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md",
                  (!inputText.trim() && !uploadedFile) || isExtracting || isPreparingFile
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 hover:-translate-y-0.5 active:translate-y-0"
                )}
              >
                {isExtracting || isPreparingFile ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    {isPreparingFile ? "Preparing PDF..." : "Extracting..."}
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Process {activeTab} Report
                  </>
                )}
              </button>
            </div>
          </header>

          <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            {/* Input Panel */}
            <div className="h-1/3 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <FileText size={14} className="text-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {uploadedFile ? "PDF Document Ready" : "Raw Content Input"}
                </span>
              </div>
              {uploadedFile ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-blue-50/50">
                   <div className="flex items-center gap-3 p-4 bg-white border border-blue-200 rounded-xl shadow-sm">
                      <FileText className="text-blue-600" size={32} />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{uploadedFile.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">PDF Document Loaded</p>
                      </div>
                      <button 
                        onClick={() => setUploadedFile(null)}
                        className="ml-4 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                   </div>
                   <p className="text-[11px] text-blue-600 mt-4 font-medium italic">Ready to process visual data...</p>
                </div>
              ) : (
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Paste the content of your ${activeTab} report here...`}
                  className="flex-1 w-full p-4 font-mono text-xs focus:outline-none resize-none bg-transparent placeholder:opacity-40"
                />
              )}
            </div>

            {/* Table Panel */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center h-10">
                <div className="flex items-center gap-2">
                  <TableIcon size={14} className="text-slate-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {activeTab} Records Table
                  </span>
                </div>
                {error && (
                  <div className="flex items-center gap-1.5 text-red-500 font-bold text-[11px]">
                    <AlertCircle size={12} />
                    FAILED: {error}
                  </div>
                )}
                {!error && infoMessage && (
                  <div className="text-blue-600 font-bold text-[11px]">
                    INFO: {infoMessage}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                <AnimatePresence mode="wait">
                  {!data ? (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 py-20"
                    >
                      <TableIcon size={64} strokeWidth={1} />
                      <p className="text-sm font-medium">Capture results by clicking "Process Report"</p>
                    </motion.div>
                  ) : (
                    <motion.table 
                      key="table"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="w-full text-left border-collapse"
                    >
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-sm">
                        <tr className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                          <th className="px-4 py-3 border-r border-slate-200">Coll #</th>
                          <th className="px-4 py-3 text-right">Payment</th>
                          <th className="px-4 py-3 text-right">Principal</th>
                          <th className="px-4 py-3 text-right">Interest</th>
                          <th className="px-4 py-3 text-right">Comm. Prin</th>
                          <th className="px-4 py-3 text-right">Comm. Int</th>
                          <th className="px-4 py-3 text-center">Qty</th>
                          <th className="px-4 py-3 text-right">Fees</th>
                          <th className="px-4 py-3 text-right">Withheld</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs text-slate-700 divide-y divide-slate-100">
                        {data.collectors.map((collector, idx) => (
                          <motion.tr 
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            key={idx} 
                            className="hover:bg-slate-50 transition-colors group"
                          >
                            <td className="px-4 py-3 font-mono font-bold text-slate-900 border-r border-slate-100 bg-slate-50/30">
                              {collector.collectorNumber}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              ${collector.paymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                              ${collector.paidPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                              ${collector.interest.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-blue-500/70">
                              ${(collector.commissionPrin || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-blue-500/70">
                              ${(collector.commissionInt || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-center font-bold">
                              {collector.numberOfPayments}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums bg-red-50/10">
                              ${collector.totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium bg-green-50/10">
                              ${collector.amountWithheld.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </motion.table>
                  )}
                </AnimatePresence>
              </div>

              {data && (
                <div className="px-6 py-2.5 bg-slate-100 border-t border-slate-200 flex justify-between items-center shrink-0">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Ready for Excel Export • {data.collectors.length} Collectors Parsed
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

