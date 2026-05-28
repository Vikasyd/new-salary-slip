const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Multer to keep uploaded files in memory
const upload = multer({ storage: multer.memoryStorage() });

// Vercel handles the API key via environment variables securely
const API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// The HTML Frontend
const htmlUI = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayScan Pro - AI Fullstack</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0f1117; color: #e8eaf0; font-family: 'Inter', sans-serif; }
    .glass-panel { background: #1a1d27; border: 1px solid #2e3454; }
  </style>
</head>
<body class="min-h-screen p-8">
  <div class="max-w-3xl mx-auto space-y-8">
    
    <header class="border-b border-gray-800 pb-4 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold">Pay<span class="text-blue-500">Scan</span> Pro</h1>
        <p class="text-gray-400 text-sm">Emergent AI Vision Edition</p>
      </div>
      <span class="bg-blue-900/50 text-blue-400 border border-blue-700/50 px-3 py-1 rounded-full text-xs font-bold">
        Live on Vercel
      </span>
    </header>

    <div class="glass-panel rounded-xl p-10 text-center border-2 border-dashed border-gray-700 hover:border-blue-500 transition-colors">
      <input type="file" id="fileInput" accept="image/*,application/pdf" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-blue-300 hover:file:bg-blue-800 cursor-pointer mx-auto max-w-md"/>
      <button id="scanBtn" class="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md font-medium transition-all w-48">
        Scan Document
      </button>
      <div id="loader" class="hidden mt-4 text-sm text-blue-400 animate-pulse">Running AI Audit...</div>
    </div>

    <div id="errorBox" class="hidden bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-md text-sm"></div>

    <div id="resultsBox" class="hidden glass-panel rounded-xl p-6 space-y-6">
      <h2 class="text-xl font-semibold border-b border-gray-800 pb-2">Structured Audit Data</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-[#0f1117] p-4 rounded-lg border border-gray-800">
          <span class="text-xs text-gray-500 uppercase tracking-wider">Employee</span>
          <p id="resName" class="font-medium text-lg mt-1">-</p>
          <p id="resPan" class="text-sm text-gray-400 font-mono">-</p>
        </div>
        <div class="bg-[#0f1117] p-4 rounded-lg border border-gray-800">
          <span class="text-xs text-gray-500 uppercase tracking-wider">Net Pay</span>
          <p id="resNet" class="font-bold text-2xl text-green-400 mt-1">-</p>
          <p id="resMonth" class="text-sm text-gray-400">-</p>
        </div>
      </div>

      <div>
        <span class="text-xs text-gray-500 uppercase tracking-wider">Raw JSON (For ERP Entry)</span>
        <pre id="resJson" class="mt-2 bg-[#090c12] border border-gray-800 p-4 rounded-lg overflow-x-auto text-xs text-blue-300 font-mono"></pre>
      </div>
    </div>
  </div>

  <script>
    const btn = document.getElementById('scanBtn');
    const input = document.getElementById('fileInput');
    const loader = document.getElementById('loader');
    const resultsBox = document.getElementById('resultsBox');
    const errorBox = document.getElementById('errorBox');

    btn.addEventListener('click', async () => {
      if (!input.files.length) return alert('Please select a file first.');
      
      const formData = new FormData();
      formData.append('document', input.files[0]);

      btn.disabled = true;
      loader.classList.remove('hidden');
      resultsBox.classList.add('hidden');
      errorBox.classList.add('hidden');

      try {
        const response = await fetch('/api/scan', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed to scan');

        document.getElementById('resName').textContent = data.employee?.name || 'N/A';
        document.getElementById('resPan').textContent = data.employee?.pan ? 'PAN: ' + data.employee.pan : 'N/A';
        document.getElementById('resNet').textContent = '₹' + (data.totals?.net?.toLocaleString('en-IN') || '0');
        document.getElementById('resMonth').textContent = data.month || 'N/A';
        document.getElementById('resJson').textContent = JSON.stringify(data, null, 2);
        
        resultsBox.classList.remove('hidden');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        loader.classList.add('hidden');
      }
    });
  </script>
</body>
</html>
`;

// GET Route: Serve the UI
app.get('/', (req, res) => res.send(htmlUI));

// POST Route: Handle AI Parsing
app.post('/api/scan', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!API_KEY) return res.status(500).json({ error: 'API Key missing on server.' });

    const mimeType = req.file.mimetype;
    const base64Data = req.file.buffer.toString('base64');
    
    const documentPart = { inlineData: { data: base64Data, mimeType } };
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are an expert Indian payroll auditor. Analyze this salary slip. 
      Extract all structured data accurately. Return ONLY valid JSON matching this schema:
      {
        "month": "Month Year",
        "employee": { "name": "string", "empId": "string", "pan": "string" },
        "earnings": { "BASIC": 0, "DA": 0 },
        "deductions": { "PF": 0, "TDS": 0, "PROFESSIONAL_TAX": 0 },
        "totals": { "gross": 0, "totalDeductions": 0, "net": 0 }
      }
    `;

    const result = await model.generateContent([prompt, documentPart]);
    const cleanJson = result.response.text().replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    
    res.json(JSON.parse(cleanJson));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to parse document." });
  }
});

module.exports = app;