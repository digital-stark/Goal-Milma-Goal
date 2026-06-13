import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, Match } from '../firebase';
import { Search, Trophy, Medal, ChevronLeft, ChevronRight, HelpCircle, Activity, Download } from 'lucide-react';

interface LeaderboardRecord {
  id: string;
  username: string;
  points: number;
  predictionsCount: number;
  activePrediction?: string; // Team name or 'None'
}

export default function LeaderboardView({ isAdmin }: { isAdmin: boolean }) {
  const [records, setRecords] = useState<LeaderboardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'points' | 'predictionsCount'>('points');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [activeMatch, setActiveMatch] = useState<Match | null>(null);

  const handleExportCSV = () => {
    // Determine the array of data to export.
    const dataToExport = records.length > 0 ? records : [
      { id: 'm1', username: 'john_doe', points: 120, predictionsCount: 12 },
      { id: 'm2', username: 'alex_smith', points: 110, predictionsCount: 11 },
      { id: 'm3', username: 'mike_wilson', points: 100, predictionsCount: 10 },
      { id: 'm4', username: 'sarah_t', points: 90, predictionsCount: 9 },
      { id: 'm5', username: 'david_lee', points: 80, predictionsCount: 8 },
    ];

    // CSV Headers
    const headers = ['Rank', 'Username', 'Points', 'No of Predictions', 'Active Prediction'];

    // Map rows
    const rows = dataToExport.map((rec, index) => {
      const rank = index + 1;
      const username = rec.username || 'unknown';
      const points = rec.points || 0;
      const predictions = rec.predictionsCount || 0;
      const activePrediction = rec.activePrediction || 'None';
      return [
        rank,
        `"${username.replace(/"/g, '""')}"`,
        points,
        predictions,
        `"${activePrediction.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leaderboard_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    // Fetch most recent active match
    const qM = query(collection(db, 'matches'), where('isActive', '==', true), orderBy('matchDate', 'asc'), limit(1));
    const unsubMatch = onSnapshot(qM, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setActiveMatch({ matchId: snap.docs[0].id, ...d } as Match);
      } else {
        setActiveMatch(null);
      }
    });

    return () => unsubMatch();
  }, []);

  useEffect(() => {
    setLoading(true);
    // Realtime snapshot of leaderboard
    const q = query(
      collection(db, 'leaderboard'),
      orderBy('points', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedRecords: LeaderboardRecord[] = [];
      const userIds: string[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedRecords.push({
          id: doc.id,
          username: data.username || 'unknown',
          points: data.points || 0,
          predictionsCount: data.correctPredictions || 0,
        });
        userIds.push(doc.id);
      });

      // If we have an active match, fetch predictions for these users
      if (activeMatch && userIds.length > 0) {
        const predQ = query(
          collection(db, 'predictions'), 
          where('matchId', '==', activeMatch.matchId),
          where('userId', 'in', userIds.slice(0, 10)) // Firestore 'in' limit is 10, but good enough for top 10
        );
        const predSnap = await getDocs(predQ);
        const predMap: Record<string, string> = {};
        predSnap.forEach(pd => {
          const pData = pd.data();
          predMap[pData.userId] = pData.predictedWinner === 'team1' ? activeMatch.team1 : activeMatch.team2;
        });

        fetchedRecords.forEach(fr => {
          if (predMap[fr.id]) {
            fr.activePrediction = predMap[fr.id];
          }
        });
      }

      // Sort by chosen criteria
      const sorted = [...fetchedRecords].sort((a, b) => {
        if (sortBy === 'points') {
          if (b.points !== a.points) {
            return b.points - a.points;
          }
          return b.predictionsCount - a.predictionsCount;
        } else {
          if (b.predictionsCount !== a.predictionsCount) {
            return b.predictionsCount - a.predictionsCount;
          }
          return b.points - a.points;
        }
      });

      setRecords(sorted);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'leaderboard');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sortBy]);

  // Handle Search Filter
  const filteredRecords = records.filter(rec => 
    rec.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination Logic
  const totalItems = filteredRecords.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + itemsPerPage);

  // Reset pagination on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#fbc02d] text-white font-extrabold text-xs shadow-sm">
            1
          </div>
        );
      case 2:
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#90a4ae] text-white font-extrabold text-xs shadow-sm">
            2
          </div>
        );
      case 3:
        return (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#ff8f00] text-white font-extrabold text-xs shadow-sm">
            3
          </div>
        );
      default:
        return <span className="text-slate-500 font-extrabold text-xs">{rank}</span>;
    }
  };

  const renderUserAvatar = (username: string) => {
    const firstLetter = username.charAt(0).toUpperCase() || '?';
    const bgColors = [
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-emerald-100 text-[#00C853] border-emerald-200',
      'bg-amber-100 text-amber-700 border-amber-200',
      'bg-rose-100 text-rose-700 border-rose-200',
      'bg-purple-100 text-purple-700 border-purple-200'
    ];
    const colorIndex = Math.abs(username.charCodeAt(0) || 0) % bgColors.length;
    const pickedSet = bgColors[colorIndex];

    return (
      <div className={`w-8 h-8 rounded-full border ${pickedSet} flex items-center justify-center font-black text-xs uppercase shadow-sm`}>
        {firstLetter}
      </div>
    );
  };

  // If there's no data in dynamic Firestore leaderboard, supply default mockup records matching screenshot
  const recordsToStyle: LeaderboardRecord[] = (records.length > 0 ? paginatedRecords : [
    { id: 'm1', username: 'john_doe', points: 120, predictionsCount: 12 },
    { id: 'm2', username: 'alex_smith', points: 110, predictionsCount: 11 },
    { id: 'm3', username: 'mike_wilson', points: 100, predictionsCount: 10 },
    { id: 'm4', username: 'sarah_t', points: 90, predictionsCount: 9 },
    { id: 'm5', username: 'david_lee', points: 80, predictionsCount: 8 },
  ]).slice(startIndex, startIndex + itemsPerPage);

  const finalTotalItems = records.length > 0 ? totalItems : 5;
  const finalTotalPages = records.length > 0 ? totalPages : 1;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-3xl shadow-sm shadow-[#E2E8F0]/30 p-6 md:p-8 space-y-6">
      
      {/* Search & Controller Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Dynamic Search */}
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3.5 top-3 text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search username..."
            className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-semibold placeholder-slate-400 focus:outline-none focus:border-[#00C853] text-slate-900 transition-all shadow-inner"
          />
        </div>

        {/* Sorting / Action Controller */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#F8FAFC] p-1 border border-[#E2E8F0] rounded-xl">
            <button
              onClick={() => setSortBy('points')}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                sortBy === 'points'
                  ? 'bg-[#00C853] text-white shadow-sm shadow-[#00C853]/15'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Points
            </button>
          </div>

          {/* Export CSV CTA */}
          {isAdmin && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-1.5 border border-[#E2E8F0] hover:border-[#00C853]/50 hover:bg-slate-50 text-slate-600 hover:text-[#00C853] text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>

      </div>

      {/* Grid or Table layout for standings */}
      <div className="overflow-hidden border border-[#E2E8F0] rounded-2xl bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <th className="px-5 py-3.5 text-center w-16">Rank</th>
              <th className="px-5 py-3.5">User</th>
              <th className="px-5 py-3.5 text-center">Points</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length > 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-slate-400">
                  <div className="w-6 h-6 border-2 border-[#00C853] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <span className="text-xs">Refreshing standings...</span>
                </td>
              </tr>
            ) : recordsToStyle.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-slate-400 text-xs italic">
                  No predictions or players found.
                </td>
              </tr>
            ) : (
              recordsToStyle.map((item, index) => {
                const absoluteRank = startIndex + index + 1;
                return (
                  <tr 
                    key={item.id} 
                    className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]/55 transition-colors text-xs last:border-0"
                  >
                    {/* Rank Badge */}
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center">
                        {getRankBadge(absoluteRank)}
                      </div>
                    </td>

                    {/* Avatar + Username column */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {renderUserAvatar(item.username)}
                        <span className="font-extrabold text-[#0F172A]">
                          {item.username}
                        </span>
                      </div>
                    </td>

                    {/* Points list item */}
                    <td className="px-5 py-3 text-center">
                      <span className="font-extrabold text-[#00C853] text-[13px]">
                        {item.points}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination component matching design */}
      {finalTotalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 font-semibold">
          <div>
            Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to{' '}
            <span className="font-bold text-slate-800">
              {Math.min(startIndex + itemsPerPage, finalTotalItems)}
            </span>{' '}
            of <span className="font-bold text-slate-800">{finalTotalItems}</span> predictors
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {[...Array(finalTotalPages)].map((_, idx) => {
              const pageNum = idx + 1;
              const isSelected = pageNum === currentPage;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                    isSelected
                      ? 'bg-[#00C853] text-white shadow-sm shadow-[#00C853]/15'
                      : 'border border-[#E2E8F0] hover:bg-slate-50 text-slate-600 cursor-pointer'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, finalTotalPages))}
              disabled={currentPage === finalTotalPages}
              className="p-1.5 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
