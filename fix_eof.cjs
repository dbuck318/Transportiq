const fs = require("fs");
let lines = fs.readFileSync("src/components/ActiveWorkspace.tsx", "utf8").split("\n");
const idx = lines.findIndex(l => l.includes("Receipt Image Viewer Modal"));
if (idx > -1) {
  lines = lines.slice(0, idx - 2);
}
const fix = `        </main>
      </div>

      {/* Receipt Image Viewer Modal */}
      {selectedViewerReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white rounded-[32px] overflow-hidden max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            <header className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedViewerReceipt.vendor ? "Receipt for " + selectedViewerReceipt.vendor : "Scanned Receipt"}
                </h3>
              </div>
              <button
                onClick={() => setSelectedViewerReceipt(null)}
                className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-6 min-h-[300px]">
              <img
                src={selectedViewerReceipt.dataUrl}
                alt="Receipt viewer"
                className="max-w-full max-h-[60vh] object-contain rounded-2xl shadow-md border border-slate-200"
                referrerPolicy="no-referrer"
              />
            </div>
            <footer className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Scanned Amount</span>
                <span className="text-xl font-black text-slate-900">
                  \${selectedViewerReceipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </footer>
          </div>
        </div>
      )}
    </motion.div>
  );
}
`;
fs.writeFileSync("src/components/ActiveWorkspace.tsx", lines.join("\n") + "\n" + fix);
