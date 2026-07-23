"use client";

import { useState } from "react";
import Link from "next/link";

export default function CSVPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState("");

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || files.length === 0) return;
    setStatus("Processing...");

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/integrations/csv/upload", {
        method: "POST", body: formData,
      });
      if (res.ok) {
        setStatus("Upload successful! Your Schema files are ready.");
      } else {
        setStatus("Upload failed. Please check your CSV format.");
      }
    } catch {
      setStatus("Network error. Please try again.");
    }
  };

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
        <h1 className="text-3xl font-bold mt-2">Upload Product CSV</h1>
        <p className="text-zinc-400">Export your products from any platform, upload here, get Schema for every SKU.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">How it works</h2>
        <ol className="text-sm text-zinc-400 space-y-2 list-decimal list-inside">
          <li>Export your products as CSV from your store admin (Shopify, WooCommerce, BigCommerce, Magento, etc.)</li>
          <li>Make sure your CSV includes columns: <code className="text-emerald-400">title, description, price, sku, brand, image_url</code></li>
          <li>Upload below. We generate JSON-LD Schema for every product.</li>
          <li>Download the Schema files and add them to your site.</li>
        </ol>
      </div>

      <form onSubmit={handleUpload} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="hidden"
            id="csv-upload"
          />
          <label htmlFor="csv-upload" className="cursor-pointer">
            <div className="text-4xl mb-2">📄</div>
            <div className="text-zinc-300 font-medium">
              {files ? `${files.length} file(s) selected` : "Click to select CSV files"}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Supports .csv files from any platform</div>
          </label>
        </div>
        <button
          type="submit"
          disabled={!files}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition"
        >
          Upload & Generate Schema
        </button>
        {status && <p className="text-sm text-center text-zinc-400">{status}</p>}
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="font-semibold mb-2">CSV Format Example</h2>
        <div className="bg-zinc-950 rounded-lg p-4 text-xs font-mono text-zinc-400 overflow-x-auto">
{`title,description,price,sku,brand,image_url,category
"Winter Jacket Pro","Warm waterproof jacket for extreme cold. 800-fill down.",189.99,WJ-001,AltCoord,https://cdn.altcoord.com/img/wj1.jpg,"Winter Jackets"
"Summer Tee","Lightweight cotton tee. Pre-shrunk. 12 colors.",29.99,ST-042,AltCoord,https://cdn.altcoord.com/img/st1.jpg,"T-Shirts"`}
        </div>
      </div>
    </main>
  );
}
