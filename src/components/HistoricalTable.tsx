import React, { useState, useEffect } from 'react';
import { Haul } from '../types';
import { Download, File, ChevronRight, FileSpreadsheet, ChevronDown, Trash2, X, AlertTriangle, Edit, Folder, FolderPlus, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

import ImportDataButton from './ImportDataButton';
import { parseCleanWeight } from '../lib/calculations';

function calculateGenericIndustryMpg(h: any) {
  // Base towing average: 9.0 base default
  const baseStandardMpg = 9.0;
  const scaleWeightVal = parseCleanWeight(h.scaleWeight);
  let weightCorrection = 0;
  if (scaleWeightVal > 0) {
    weightCorrection = -((Math.max(0, scaleWeightVal - 5000)) / 1000) * 0.15;
  } else {
    weightCorrection = -((7500 - 5000) / 1000) * 0.15;
  }

  // Identify state terrain if possible
  let terrainCorrection = 0;
  const pickUp = h.pickUpLocation || '';
  const delivery = h.deliveryLocation || '';
  const matchPick = pickUp.match(/\b([A-Z]{2})\b/);
  const matchDel = delivery.match(/\b([A-Z]{2})\b/);
  const states = Array.from(new Set([matchPick ? matchPick[1] : null, matchDel ? matchDel[1] : null].filter(Boolean)));
  
  if (states.length > 0) {
    const mountainStates = ["CO", "UT", "WY", "ID", "MT", "WA", "OR", "CA", "NV", "NM", "AZ"];
    const plainsStates = ["KS", "NE", "SD", "ND", "OK", "IA", "TX"];
    
    let mtCount = 0;
    let plainsCount = 0;
    states.forEach((st: any) => {
      if (mountainStates.includes(st)) mtCount++;
      if (plainsStates.includes(st)) plainsCount++;
    });

    if (mtCount > 0) terrainCorrection += -(0.35 * mtCount);
    if (plainsCount > 0) terrainCorrection += -(0.18 * plainsCount);
  }

  const finalMpg = baseStandardMpg + weightCorrection + terrainCorrection;
  
  // Real-world physical ceilings for generic towing configurations on highways
  let maxPhysicalMpgCap = 16.0;
  if (scaleWeightVal >= 15000) maxPhysicalMpgCap = 7.5;
  else if (scaleWeightVal >= 12000) maxPhysicalMpgCap = 9.0;
  else if (scaleWeightVal >= 9000) maxPhysicalMpgCap = 10.5;
  else if (scaleWeightVal >= 6000) maxPhysicalMpgCap = 12.0;
  else if (scaleWeightVal >= 3000) maxPhysicalMpgCap = 14.0;
  else maxPhysicalMpgCap = 16.0;

  return Math.min(maxPhysicalMpgCap, Math.max(4.0, Number(finalMpg.toFixed(1))));
}

interface Props {
  hauls: Haul[];
  onDelete: (id: string) => Promise<void>;
  onRecall: (id: string) => Promise<void>;
  ownerId: string;
  activeFolderFilter: string | null;
  setActiveFolderFilter: (folder: string | null) => void;
  customFolders: string[];
  setCustomFolders: (folders: string[]) => void;
}

export default function HistoricalTable({ 
  hauls = [], 
  onDelete, 
  onRecall, 
  ownerId,
  activeFolderFilter,
  setActiveFolderFilter,
  customFolders,
  setCustomFolders
}: Props) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedHaulIds, setSelectedHaulIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [activeTab, setActiveTab] = useState<'Active' | 'Completed'>('Active');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');

  const removeCustomFolder = (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customFolders.filter(f => f !== folderName);
    setCustomFolders(updated);
    if (activeFolderFilter === folderName) {
      setActiveFolderFilter(null);
    }
  };

  const visibleHauls = (() => {
    const filtered = (hauls || []).filter(h => 
      (activeTab === 'Active' ? h.status === 'Active' : (h.status === 'Completed' || h.status === 'Finalized')) && 
      (!activeFolderFilter || h.folder === activeFolderFilter)
    );
    if (activeTab === 'Completed') {
      return [...filtered].sort((a, b) => {
        const dateA = a.deliveryDate || '';
        const dateB = b.deliveryDate || '';
        return dateB.localeCompare(dateA);
      });
    }
    return filtered;
  })();
  const uniqueFolders = Array.from(new Set((hauls || []).filter(h => (activeTab === 'Active' ? h.status === 'Active' : (h.status === 'Completed' || h.status === 'Finalized')) && h.folder).map(h => h.folder!)));
  const allFolders = Array.from(new Set([...uniqueFolders, ...customFolders]));

  // Auto-clear stale selected IDs when they disappear from the visible hauls list (e.g., when opened/edited or deleted)
  useEffect(() => {
    setSelectedHaulIds(prev => {
      let isStale = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (visibleHauls.some(h => h.id === id)) {
          next.add(id);
        } else {
          isStale = true;
        }
      });
      return isStale ? next : prev;
    });
  }, [visibleHauls]);

  const toggleSelection = (id: string) => {
    setSelectedHaulIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedHaulIds.size === (visibleHauls.length || 0) && (visibleHauls.length || 0) > 0) {
      setSelectedHaulIds(new Set());
    } else {
      setSelectedHaulIds(new Set(visibleHauls.map(h => h.id!) || []));
    }
  };

  const assignFolderToSelected = async () => {
    if (!folderNameInput.trim()) return;
    const folderName = folderNameInput.trim();

    if (!customFolders.includes(folderName)) {
      const updated = [...customFolders, folderName];
      setCustomFolders(updated);
    }

    if (selectedHaulIds.size > 0) {
      const promises = Array.from(selectedHaulIds).map((id: string) => 
        updateDoc(doc(db, 'hauls', id), { folder: folderName })
      );
      await Promise.all(promises);
      setSelectedHaulIds(new Set());
    }

    setFolderNameInput('');
    setShowFolderModal(false);
  };

  const markSelectedAsCompleted = async () => {
    const promises = Array.from(selectedHaulIds).map((id: string) => 
      updateDoc(doc(db, 'hauls', id), { status: 'Completed' })
    );
    await Promise.all(promises);
    setSelectedHaulIds(new Set());
  };

  const moveSelectedToActive = async () => {
    const promises = Array.from(selectedHaulIds).map((id: string) => 
      updateDoc(doc(db, 'hauls', id), { status: 'Active' })
    );
    await Promise.all(promises);
    setSelectedHaulIds(new Set());
  };

  const itemsToExport = selectedHaulIds.size > 0 
    ? (visibleHauls || []).filter(h => selectedHaulIds.has(h.id!)) 
    : (visibleHauls || []);

  const exportToExcel = async () => {
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    
    // We add loading feedback in a real app, but for now we just await
    const mappedData = await Promise.all(itemsToExport.map(async h => {
      let fuel = 0;
      let fuelGallons = 0;
      let def = 0;
      let defGallons = 0;
      let maintenance = 0;
      let food = 0;
      let misc = 0;
      let toll = 0;

      try {
        const expensesSnap = await getDocs(query(collection(db, 'hauls', h.id!, 'expenses'), where('ownerId', '==', ownerId)));
        expensesSnap.forEach(doc => {
          const amt = doc.data().amount || 0;
          const gal = doc.data().gallons || 0;
          const cat = doc.data().category;
          if (cat === 'Fuel') {
            fuel += amt;
            fuelGallons += gal;
          }
          else if (cat === 'DEF') {
            def += amt;
            defGallons += gal;
          }
          else if (cat === 'Maintenance' || cat === 'Maintenance/DEF') maintenance += amt;
          else if (cat === 'Food') food += amt;
          else if (cat === 'Misc') misc += amt;
          else if (cat === 'Toll') toll += amt;
        });
      } catch (err) {
        console.warn("Could not fetch expenses for haul", h.id, err);
      }

      return {
        Unit: h.unitNumber,
        Type: h.unitType,
        Pickup: h.pickUpLocation,
        Delivery: h.deliveryLocation,
        "Paid Miles": h.loadedMiles,
        "Empty Miles": h.deadheadMiles,
        RPM: h.ratePerMile,
        Revenue: h.grossRevenue,
        "Total Expenses": h.totalOperatingCosts,
        "Fuel Expense": fuel,
        "Fuel Gallons": fuelGallons > 0 ? fuelGallons : undefined,
        "DEF Expense": def,
        "DEF Gallons": defGallons > 0 ? defGallons : undefined,
        "Maintenance Expense": maintenance,
        "Food Expense": food,
        "Toll Expense": toll,
        "Misc Expense": misc,
        Profit: h.netProfit,
        Date: h.deliveryDate
      };
    }));

    const ws = XLSX.utils.json_to_sheet(mappedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hauls");
    XLSX.writeFile(wb, `Transport_LogIQ_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportMenu(false);
  };

  const exportToPDF = async () => {
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    
    // Create portrait A4 PDF
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Fetch and prepare all data
    const sortedItems = [...itemsToExport].sort((a, b) => {
      const uA = a.unitNumber || '';
      const uB = b.unitNumber || '';
      return uA.localeCompare(uB);
    });

    for (let idx = 0; idx < sortedItems.length; idx++) {
      const h = sortedItems[idx];
      
      // Load expenses for this unit
      const expenses: any[] = [];
      try {
        const expensesSnap = await getDocs(query(collection(db, 'hauls', h.id!, 'expenses'), where('ownerId', '==', ownerId)));
        expensesSnap.forEach(docSnap => {
          expenses.push({ id: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        console.warn("Could not fetch expenses for haul", h.id, err);
      }

      // Add fresh page if not first element
      if (idx > 0) {
        doc.addPage();
      }

      let y = 15;

      // Header block
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('Transport LogIQ Unit Report', 15, y);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // slate-400
      doc.text(`Generated: ${new Date().toLocaleString()}`, 135, y);

      y += 8;
      
      // Separator line
      doc.setDrawColor(226, 232, 240); // border slate-200
      doc.setLineWidth(0.5);
      doc.line(15, y, 195, y);

      y += 10;

      // Title header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(`Unit: ${h.unitNumber || 'N/A'}  |  Type: ${h.unitType || 'N/A'}${h.loadNumber ? `  |  Load #: ${h.loadNumber}` : ''}`, 15, y);

      y += 8;

      // 1. General details header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(59, 130, 246); // blue-600
      doc.text('1. Operational & Route Details', 15, y);
      
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85); // slate-700

      const leftCol = [
        ['Unit Number:', h.unitNumber || 'N/A'],
        ['Unit Type:', h.unitType || 'N/A'],
        ['Load Number:', h.loadNumber || 'N/A'],
        ['Customer:', h.customerName || 'N/A'],
        ['Pickup:', `${h.pickUpLocation || 'N/A'} (${h.pickUpDate || 'N/A'})`],
        ['Delivery:', `${h.deliveryLocation || 'N/A'} (${h.deliveryDate || 'N/A'})`],
        ['Folder:', h.folder || 'None'],
      ];

      const rightCol = [
        ['Actual Trip Miles:', `${(h.totalMiles || 0).toLocaleString()} mi`],
        ['Paid Trip Miles:', `${(h.loadedMiles || 0).toLocaleString()} mi`],
        ['Deadhead Miles:', `${(h.deadheadMiles || 0).toLocaleString()} mi`],
        ['Gross Rating (GVWR):', h.grossWeight ? `${h.grossWeight.toLocaleString()} lbs` : 'N/A'],
        ['Scale/Dry Weight:', h.scaleWeight ? `${h.scaleWeight.toLocaleString()} lbs` : 'N/A'],
        ['Industry Avg MPG:', calculateGenericIndustryMpg(h) ? `${calculateGenericIndustryMpg(h).toFixed(1)} mpg` : 'N/A'],
        ['Rate Per Mile (RPM):', `$${(h.ratePerMile || 0).toFixed(2)} / mi`],
      ];

      const rowsCount = Math.max(leftCol.length, rightCol.length);
      for (let i = 0; i < rowsCount; i++) {
        if (leftCol[i]) {
          doc.setFont('helvetica', 'bold');
          doc.text(leftCol[i][0], 15, y);
          doc.setFont('helvetica', 'normal');
          doc.text(leftCol[i][1], 45, y);
        }
        if (rightCol[i]) {
          doc.setFont('helvetica', 'bold');
          doc.text(rightCol[i][0], 115, y);
          doc.setFont('helvetica', 'normal');
          doc.text(rightCol[i][1], 155, y);
        }
        y += 5.5;
      }

      if (h.notes) {
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', 15, y);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(h.notes, 150);
        doc.text(splitNotes, 45, y);
        y += (splitNotes.length * 4.5) + 3;
      } else {
        y += 3;
      }

      y += 2;

      // 2. Recorded Expenses
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(59, 130, 246);
      doc.text('2. Detailed Logged Expenses', 15, y);

      y += 5;

      if (expenses.length > 0) {
        const tableBody = expenses.map(exp => {
          let details = '-';
          if (exp.category === 'Fuel' || exp.category === 'DEF') {
            const gallonsText = exp.gallons ? `${Number(exp.gallons).toFixed(2)} gal` : '';
            const priceText = exp.pricePerGallon ? `@ $${Number(exp.pricePerGallon).toFixed(3)}/gal` : '';
            details = [gallonsText, priceText].filter(Boolean).join(' ');
          }
          const expDate = exp.timestamp ? new Date(exp.timestamp).toLocaleDateString() : 'N/A';
          return [
            exp.category,
            exp.vendor || 'N/A',
            expDate,
            `$${Number(exp.amount || 0).toFixed(2)}`,
            details || '-'
          ];
        });

        autoTable(doc, {
          head: [['Category', 'Vendor / Description', 'Date', 'Amount', 'Fuel/DEF Details']],
          body: tableBody,
          startY: y,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 15, right: 15 },
        });
        const finalTableY = (doc as any).lastAutoTable?.finalY;
        y = (finalTableY !== undefined) ? finalTableY + 12 : y + 30;
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text('No expenses recorded for this unit.', 15, y + 3);
        y += 12;
      }

      // Safeguard against table stretching into low page margin
      if (y > 255) {
        doc.addPage();
        y = 15;
      } else {
        y += 2;
      }

      // 3. Financial Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(59, 130, 246);
      doc.text('3. Financial Overview', 15, y);

      y += 5;

      // Card-like background for financial metrics
      doc.setFillColor(248, 250, 252); // extremely light gray/slate
      doc.roundedRect(15, y, 180, 18, 2, 2, 'F');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('GROSS REVENUE', 25, y + 6);
      doc.text('TOTAL OPERATING COSTS', 85, y + 6);
      doc.text('NET TRIP PROFIT', 145, y + 6);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74); // green-600
      doc.text(`$${(h.grossRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 25, y + 13);

      doc.setTextColor(220, 38, 38); // red-600
      doc.text(`-$${(h.totalOperatingCosts || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 85, y + 13);

      const netProfitVal = h.netProfit || 0;
      if (netProfitVal < 0) {
        doc.setTextColor(220, 38, 38);
      } else {
        doc.setTextColor(22, 163, 74);
      }
      doc.text(`$${netProfitVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 145, y + 13);
    }

    // Samsung Phone specific fallback: By setting the MIME type to application/octet-stream,
    // the Samsung standard browser downloads it as a file directly to storage/Google Drive folders,
    // bypassing immediate force-opening-interception via Samsung Notes app.
    const pdfDataArr = doc.output('arraybuffer');
    const attachmentBlob = new Blob([pdfDataArr], { type: 'application/octet-stream' });
    const downloadBlobUrl = URL.createObjectURL(attachmentBlob);
    
    const virtualLink = document.createElement('a');
    virtualLink.href = downloadBlobUrl;
    virtualLink.download = `Fleet_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(virtualLink);
    virtualLink.click();
    document.body.removeChild(virtualLink);
    URL.revokeObjectURL(downloadBlobUrl);

    setShowExportMenu(false);
  };

  const confirmDelete = async () => {
    if (deletingId) {
      await onDelete(deletingId);
      setDeletingId(null);
    }
  };

  const confirmBulkDelete = async () => {
    for (const id of selectedHaulIds) {
      await onDelete(id);
    }
    setSelectedHaulIds(new Set());
    setShowBulkDeleteModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl w-fit">
          <button 
            type="button"
            id="in-progress-tab-btn"
            onClick={() => { setActiveTab('Active'); setSelectedHaulIds(new Set()); }}
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'Active' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            In Progress Units
          </button>
          <button 
            type="button"
            id="completed-tab-btn"
            onClick={() => { setActiveTab('Completed'); setSelectedHaulIds(new Set()); }}
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'Completed' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Completed
          </button>
        </div>
      </div>

      <div className="sticky top-[-16px] md:top-[-40px] z-20 bg-[#f8fafc]/95 backdrop-blur-md py-4 -mx-4 md:-mx-10 px-4 md:px-10 border-b border-slate-200/50 shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className="text-sm font-semibold text-slate-700">
          {selectedHaulIds.size > 0 
            ? `${selectedHaulIds.size} deliveries selected`
            : `${visibleHauls.length} ${activeTab === 'Active' ? 'in progress' : 'completed'} units`}
        </p>
        
        <div className="flex flex-wrap items-center gap-3">
          {selectedHaulIds.size === 0 && (
            <>
              <ImportDataButton ownerId={ownerId} />
              <button 
                onClick={() => {
                  setFolderNameInput('');
                  setShowFolderModal(true);
                }}
                className="flex items-center gap-2 bg-purple-50 text-purple-700 border border-purple-100 px-4 py-2 rounded-full text-sm font-semibold hover:bg-purple-100 transition-all shadow-sm focus:outline-none"
              >
                <FolderPlus className="w-4 h-4" /> 
                Folder
              </button>
            </>
          )}
          
          {selectedHaulIds.size === 1 && (activeTab === 'Active' || activeTab === 'Completed') && (
            <button 
              onClick={() => {
                onRecall([...selectedHaulIds][0]);
                setSelectedHaulIds(new Set());
              }}
              className="flex items-center gap-2 bg-blue-50 text-blue-600 border border-blue-100 px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-100 transition-all shadow-sm focus:outline-none"
            >
              <Edit className="w-4 h-4" /> 
              Open
            </button>
          )}

          {selectedHaulIds.size > 0 && (
            <>
              {activeTab === 'Active' ? (
                <button 
                  onClick={markSelectedAsCompleted}
                  className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-100 px-4 py-2 rounded-full text-sm font-semibold hover:bg-green-100 transition-all shadow-sm focus:outline-none"
                >
                  <CheckCircle2 className="w-4 h-4" /> 
                  Mark Completed
                </button>
              ) : (
                <button 
                  onClick={moveSelectedToActive}
                  className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-full text-sm font-semibold hover:bg-slate-100 transition-all shadow-sm focus:outline-none"
                >
                  <CheckCircle2 className="w-4 h-4" /> 
                  Move to In Progress
                </button>
              )}
              
              <button 
                onClick={() => setShowFolderModal(true)}
                className="flex items-center gap-2 bg-purple-50 text-purple-700 border border-purple-100 px-4 py-2 rounded-full text-sm font-semibold hover:bg-purple-100 transition-all shadow-sm focus:outline-none"
              >
                <FolderPlus className="w-4 h-4" /> 
                Folder
              </button>

              <button 
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-100 transition-all shadow-sm focus:outline-none"
              >
                <Trash2 className="w-4 h-4" /> 
                Delete
              </button>
            </>
          )}

          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-2 bg-white border border-slate-200 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm focus:outline-none"
          >
            <Download className="w-4 h-4 text-blue-600" /> 
            Export
            <ChevronDown className={`w-4 h-4 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
          </button>

          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-3xl shadow-xl z-20 p-2 overflow-hidden">
                <button 
                  onClick={exportToExcel}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50 rounded-2xl transition-colors flex items-center gap-3"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Excel Spreadsheet
                </button>
                <button 
                  onClick={exportToPDF}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50 rounded-2xl transition-colors flex items-center gap-3"
                >
                  <File className="w-4 h-4 text-red-500" />
                  PDF Document
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-6 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={(visibleHauls?.length || 0) > 0 && selectedHaulIds.size === (visibleHauls?.length || 0)}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider">Unit</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider">Customer</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider">Route</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider text-right">Paid Miles</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider text-right">Revenue</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider text-right">Net Profit</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider text-center">Folder</th>
                <th className="p-6 text-xs font-semibold uppercase text-slate-400 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleHauls.map((haul) => (
                <tr 
                  key={haul.id} 
                  className={`transition-colors cursor-pointer group ${selectedHaulIds.has(haul.id!) ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'}`}
                  onClick={() => toggleSelection(haul.id!)}
                >
                  <td className="p-6" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={selectedHaulIds.has(haul.id!)}
                      onChange={() => toggleSelection(haul.id!)}
                    />
                  </td>
                  <td className="p-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{haul.unitNumber}</p>
                        {haul.folder && (
                          <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-[10px] font-semibold border border-purple-100 shrink-0">
                            <Folder className="w-3 h-3 mr-1" />
                            {haul.folder}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{haul.unitType}</p>
                    </div>
                  </td>
                  <td className="p-6">
                    <div>
                      <span className="font-medium text-slate-700">{haul.customerName || '-'}</span>
                      {haul.notes && (
                        <p className="text-[11px] text-slate-400 mt-1 font-medium italic max-w-[180px] truncate" title={haul.notes}>
                          "{haul.notes}"
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700">{String(haul.pickUpLocation || 'Origin').split(',')[0]}</span>
                      <ChevronRight className="w-3 h-3 text-slate-300" />
                      <span className="text-sm font-medium text-slate-700">{String(haul.deliveryLocation || 'Destination').split(',')[0]}</span>
                    </div>
                    {(haul.deliveryDate || haul.pickUpDate) && (
                      <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {haul.pickUpDate ? `${haul.pickUpDate} - ` : ''}{haul.deliveryDate || haul.pickUpDate}
                      </p>
                    )}
                  </td>
                  <td className="p-6 text-right">
                    <span className="text-sm font-medium text-slate-700">{Number(haul.loadedMiles || 0).toLocaleString()} mi</span>
                  </td>
                  <td className="p-6 text-right">
                    <span className="text-sm font-medium text-slate-700">
                      ${Number(haul.grossRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="p-6 text-right">
                    <span className={`text-sm font-bold ${Number(haul.netProfit || 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                      ${Number(haul.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    {haul.folder ? (
                      <span className="inline-flex items-center px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-[10px] font-semibold">
                        <Folder className="w-3 h-3 mr-1" />
                        {haul.folder}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-6 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2 text-slate-400">
                      {(activeTab === 'Active' || activeTab === 'Completed') && (
                        <button 
                          onClick={() => {
                             onRecall(haul.id!);
                             setSelectedHaulIds(new Set());
                          }}
                          className="p-2 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Open / Edit Unit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => setDeletingId(haul.id!)}
                        className="p-2 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Delete Trip"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(visibleHauls?.length || 0) === 0 && (
                <tr>
                  <td colSpan={9} className="p-20 text-center text-slate-400 text-sm font-medium italic">Your delivery history is empty.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-8"
            >
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl w-fit mb-6">
                <FolderPlus className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {selectedHaulIds.size > 0 ? 'Assign Folder' : 'Create Folder'}
              </h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {selectedHaulIds.size > 0 
                  ? `Enter or select a folder name to organize the selected ${selectedHaulIds.size} deliveries.`
                  : 'Enter or select a folder name to create a new folder.'}
              </p>
              
              <input
                type="text"
                autoFocus
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                placeholder="e.g. Q3 Dedicated Route"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 mb-6"
              />

              {allFolders.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Existing Folders</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border border-slate-100 rounded-2xl bg-slate-50/50">
                    {allFolders.map(folder => (
                      <button
                        key={folder}
                        type="button"
                        onClick={() => setFolderNameInput(folder)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          folderNameInput === folder 
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {folder}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowFolderModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-700 font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={assignFolderToSelected}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold text-sm transition-colors"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showBulkDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-8"
            >
              <div className="p-3 bg-red-50 text-red-600 rounded-2xl w-fit mb-6">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete {selectedHaulIds.size} records?</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">These records will be permanently removed from your history. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-700 font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmBulkDelete}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold text-sm transition-colors"
                >
                  Delete Selected
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-8"
            >
              <div className="p-3 bg-red-50 text-red-600 rounded-2xl w-fit mb-6">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete this record?</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">This record will be permanently removed from your history. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-700 font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
