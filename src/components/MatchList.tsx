import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, Match, Prediction, UserProfile } from '../firebase';
import { 
  Trophy, 
  Clock, 
  Lock, 
  Zap, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Dribbble
} from 'lucide-react';

interface MatchListProps {
  user: any;
  userProfile: UserProfile | null;
  onOpenAuth: () => void;
}

export default function MatchList({ user, userProfile, onOpenAuth }: MatchListProps) {
  const [activeMatches, setActiveMatches] = useState<Match[]>([]);
  const [dbHasMatches, setDbHasMatches] = useState<boolean>(false);
  const [userPredictions, setUserPredictions] = useState<Record<string, Prediction>>({});
  const [loading, setLoading] = useState(true);
  
  // Selection Drafts
  const [draftSelections, setDraftSelections] = useState<Record<string, 'team1' | 'team2' | 'draw'>>({});
  const [team1GoalsDraft, setTeam1GoalsDraft] = useState<Record<string, number>>({});
  const [team2GoalsDraft, setTeam2GoalsDraft] = useState<Record<string, number>>({});
  const [submissionLoading, setSubmissionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Countdown timer hook state
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number }>({
    days: 2,
    hours: 6,
    minutes: 45,
    seconds: 30
  });

  // 1. Fetch active scheduled matches and track total matches exists
  useEffect(() => {
    const q = collection(db, 'matches');

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Match[] = [];
      let totalCount = 0;
      snapshot.forEach((doc) => {
        const d = doc.data();
        totalCount++;
        const isExpired = (() => {
          const expirationTime = d.expiryDate ? new Date(d.expiryDate).getTime() : new Date(d.matchDate).getTime();
          return Date.now() > expirationTime;
        })();
        if (d.isActive === true && d.status === 'scheduled') {
          list.push({
            matchId: doc.id,
            team1: d.team1,
            team2: d.team2,
            matchDate: d.matchDate,
            expiryDate: d.expiryDate,
            team1Logo: d.team1Logo,
            team2Logo: d.team2Logo,
            imageUrl: d.imageUrl,
            isActive: d.isActive,
            status: d.status,
            winner: d.winner,
            createdAt: d.createdAt
          });
        }
      });
      // Sort matches by closeness in date
      list.sort((a,b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
      setActiveMatches(list);
      setDbHasMatches(totalCount > 0);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'matches');
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch logged-in user's submission history
  useEffect(() => {
    if (!user) {
      setUserPredictions({});
      return;
    }

    const q = query(
      collection(db, 'predictions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const preds: Record<string, Prediction> = {};
      snapshot.forEach((doc) => {
        const d = doc.data();
        preds[d.matchId] = {
          predictionId: doc.id,
          userId: d.userId,
          username: d.username,
          matchId: d.matchId,
          predictedWinner: d.predictedWinner,
          team1GoalsPredict: d.team1GoalsPredict ?? d.team1GoalsPredict,
          team2GoalsPredict: d.team2GoalsPredict ?? d.team2GoalsPredict,
          pointsEarned: d.pointsEarned || 0,
          isProcessed: d.isProcessed || false,
          createdAt: d.createdAt
        };
      });
      setUserPredictions(preds);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'predictions');
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Countdown logic to the main featured match
  useEffect(() => {
    if (activeMatches.length === 0) {
      // Mock countdown if empty
      const timer = setInterval(() => {
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 54); // 2 days, 6 hours from now approx
        const diff = futureDate.getTime() - new Date().getTime();
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / 1000 / 60) % 60),
          seconds: Math.floor((diff / 1000) % 60)
        });
      }, 1000);
      return () => clearInterval(timer);
    }

    const timer = setInterval(() => {
      const kickoff = new Date(activeMatches[0].matchDate).getTime();
      const now = new Date().getTime();
      const diff = kickoff - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        clearInterval(timer);
      } else {
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / 1000 / 60) % 60),
          seconds: Math.floor((diff / 1000) % 60)
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeMatches]);

  // Vector Country Flag generator for stunning visual representation
  const renderTeamLogo = (teamName: string, customLogo?: string, sizeClass = "w-28 h-28 md:w-36 md:h-36") => {
    if (customLogo) {
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden border border-slate-200 shadow-md bg-white p-3 flex items-center justify-center transition-transform hover:scale-105`} title={teamName}>
          <img src={customLogo} alt={teamName} className="max-w-full max-h-full object-contain" />
        </div>
      );
    }
    const normalized = teamName.toLowerCase().trim();
    if (normalized.includes('argentina')) {
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden border border-slate-200 shadow-md flex flex-col justify-between`} title="Argentina">
          <div className="bg-[#74ACDF] h-1/3 w-full"></div>
          <div className="bg-white h-1/3 w-full flex items-center justify-center relative">
            <div className="w-6 h-6 rounded-full bg-[#F9C523] border border-[#DE9B04] relative flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#DE9B04]"></div>
            </div>
          </div>
          <div className="bg-[#74ACDF] h-1/3 w-full"></div>
        </div>
      );
    }
    if (normalized.includes('brazil')) {
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden border border-slate-200 shadow-md bg-[#009C3B] relative flex items-center justify-center`} title="Brazil">
          <div className="w-[110px] h-[110px] bg-[#FFDF00] rotate-45 transform flex items-center justify-center"></div>
          <div className="absolute w-16 h-16 rounded-full bg-[#002776] border border-[#FFDF00]/20 flex items-center justify-center">
            <div className="absolute w-full h-[4px] bg-white top-[28px] -rotate-12"></div>
            <div className="absolute top-[38px] left-[22px] w-1.5 h-1.5 rounded-full bg-white opacity-80"></div>
            <div className="absolute top-[42px] left-[30px] w-1.5 h-1.5 rounded-full bg-white opacity-90"></div>
          </div>
        </div>
      );
    }
    // Generic beautiful design badge
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-tr from-emerald-500 to-green-600 border border-slate-200 shadow-md flex items-center justify-center relative text-white font-extrabold text-xl`}>
        <Dribbble className="w-14 h-14 text-white opacity-90" />
      </div>
    );
  };

  // Handle choice submission
  const handleSubmitPrediction = async (matchId: string) => {
    if (!user || user.isAnonymous === false && user.email === 'guest@predict.com') { // Basic check for guest
        setErrorMessage("Please sign in or create an account to submit predictions.");
        onOpenAuth();
        return;
    }
    
    const choice = draftSelections[matchId];
    if (!choice) {
      setErrorMessage("Please select a predicted team first before submitting.");
      return;
    }

    // Guard duplicate submission client-side
    if (userPredictions[matchId]) {
      setErrorMessage("You have already submitted your prediction for this match.");
      return;
    }

    setSubmissionLoading(matchId);
    setErrorMessage(null);
    setSuccessMessage(null);

    const predDocId = `${user.uid}_${matchId}`;

    try {
      // Re-verify document existence in Firestore for total safety
      const predRef = doc(db, 'predictions', predDocId);
      const docSnap = await getDoc(predRef);
      if (docSnap.exists()) {
        throw new Error("You have already submitted your prediction for this match.");
      }

      await setDoc(predRef, {
        predictionId: predDocId,
        userId: user.uid,
        username: userProfile?.username || 'guest',
        matchId,
        predictedWinner: choice,
        team1GoalsPredict: team1GoalsDraft[matchId] ?? 0,
        team2GoalsPredict: team2GoalsDraft[matchId] ?? 0,
        pointsEarned: 0,
        isProcessed: false,
        createdAt: serverTimestamp()
      });

      setSuccessMessage("Score Prediction submitted! Good luck!");
      // Clean selections draft
      const newDrafts = { ...draftSelections };
      delete newDrafts[matchId];
      setDraftSelections(newDrafts);

    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save prediction.");
    } finally {
      setSubmissionLoading(null);
    }
  };

  const handleSelectTeam = (matchId: string, team: 'team1' | 'team2' | 'draw') => {
    // If prediction exists, block selection completely
    if (userPredictions[matchId]) {
      setErrorMessage("Prediction is final. You have already submitted your prediction for this match.");
      return;
    }
    setDraftSelections(prev => ({
      ...prev,
      [matchId]: team
    }));
    setErrorMessage(null);
  };

  // Safe formatting function for kickoff display
  const formatKickoffDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      };
      return d.toLocaleDateString('en-US', options).replace(',', '');
    } catch {
      return dateStr;
    }
  };

  // If loading matches
  if (loading) {
    return (
      <div className="py-16 bg-white border border-[#E2E8F0] rounded-3xl flex flex-col items-center justify-center text-slate-400 shadow-sm text-sm">
        <div className="w-9 h-9 border-t-2 border-[#00C853] border-r-2 border-transparent rounded-full animate-spin mb-3"></div>
        <span>Reading scheduled soccer matches...</span>
      </div>
    );
  }

  // Check if database has no active matches
  if (activeMatches.length === 0) {
    return (
      <div className="py-16 bg-slate-50/50 border border-slate-200/60 rounded-[2rem] flex flex-col items-center justify-center text-slate-450 p-10 text-center space-y-3">
        <div className="text-4xl animate-pulse">⚽</div>
        <p className="font-black text-slate-800 uppercase tracking-widest text-xs">No Active Matches Open for Prediction</p>
        <p className="text-slate-400 font-semibold text-[11px] max-w-xs leading-relaxed">
          The prediction window is currently closed. Stay tuned for the upcoming schedules or check out the leaderboard rankings!
        </p>
      </div>
    );
  }

  const matchesToRender = activeMatches;

  return (
    <div id="match-section-canvas" className="space-y-6">
      
      {/* Real-time notices messages */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs flex items-center gap-2.5 transition-all">
          <AlertTriangle className="w-4.5 h-4.5 text-red-500" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-[#00C853] p-4 rounded-xl text-xs flex items-center gap-2.5 transition-all">
          <CheckCircle className="w-4.5 h-4.5 text-[#00C853]" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}      {/* RENDER ACTIVE MATCH CARDS */}
      <div className={`grid gap-6 ${
        matchesToRender.length === 1 ? 'grid-cols-1 max-w-xl mx-auto w-full' :
        matchesToRender.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto w-full' :
        'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full'
      }`}>
        {matchesToRender.map((m) => {
          const userPred = userPredictions[m.matchId];
          const draftChoice = draftSelections[m.matchId];
          
          const isExpired = (() => {
            const expirationTime = m.expiryDate ? new Date(m.expiryDate).getTime() : new Date(m.matchDate).getTime();
            return Date.now() > expirationTime;
          })();
          
          const isLocked = !!userPred || isExpired;
          const isSubmitting = submissionLoading === m.matchId;

          // Is team selected?
          const isTeam1Selected = userPred ? userPred.predictedWinner === 'team1' : draftChoice === 'team1';
          const isTeam2Selected = userPred ? userPred.predictedWinner === 'team2' : draftChoice === 'team2';
          const isDrawSelected = userPred ? userPred.predictedWinner === 'draw' : draftChoice === 'draw';

          return (
            <div key={m.matchId} className="bg-white border border-[#E2E8F0] rounded-[2rem] shadow-md shadow-[#E2E8F0]/20 overflow-hidden p-6 md:p-8 flex flex-col justify-between hover:shadow-lg transition-all duration-300 border-t-4 border-t-emerald-450 h-full">
              
              {/* 1. Accent Close Pin & Countdown */}
              <div className="flex flex-col items-center justify-center gap-1.5 text-xs text-slate-400 font-extrabold mb-6 text-center">

                {m.expiryDate && (
                  <div className="text-[10px] text-red-500 font-bold bg-red-50 border border-red-100/50 rounded-full px-2.5 py-0.5 mt-1 flex items-center justify-center gap-1 flex-wrap">
                    <span>⏳ Closes:</span>
                    <span className="font-black">{formatKickoffDate(m.expiryDate)}</span>
                  </div>
                )}
              </div>

              {/* 2. Compact Grid VS Section */}
              <div className="grid grid-cols-2 gap-4 relative mt-2">
                
                {/* Left Choice */}
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleSelectTeam(m.matchId, 'team1')}
                  className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border transition-all text-center focus:outline-none ${
                    isLocked 
                      ? 'border-transparent opacity-85' 
                      : 'border-transparent hover:bg-slate-50 cursor-pointer active:scale-98'
                  } ${isTeam1Selected ? 'bg-emerald-50/50 border-emerald-300 ring-4 ring-[#00C853]/15' : ''}`}
                >
                  {renderTeamLogo(m.team1, m.team1Logo, "w-[150px] h-[150px] flex-shrink-0")}
                  <span className="text-sm font-black text-slate-950 mt-2.5 uppercase tracking-wider truncate w-full">
                    {m.team1}
                  </span>
                  {!isLocked && (
                    <span className={`text-[9px] uppercase font-black px-3 py-1 rounded-full mt-1.5 ${
                      isTeam1Selected 
                        ? 'bg-[#00C853] text-white' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isTeam1Selected ? 'Selected' : 'Pick'}
                    </span>
                  )}
                </button>

                {/* Absolute Centered Draw Button */}
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleSelectTeam(m.matchId, 'draw')}
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center p-2 rounded-full transition-all focus:outline-none ${
                    isLocked 
                      ? 'opacity-85' 
                      : 'hover:bg-slate-50 cursor-pointer active:scale-98'
                  } ${isDrawSelected ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-[#00C853]/15' : 'bg-white border border-[#CBD5E1]'}`}
                >
                  <span className="text-[10px] font-black text-slate-800">DRW</span>
                </button>

                {/* Right Choice */}
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleSelectTeam(m.matchId, 'team2')}
                  className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border transition-all text-center focus:outline-none ${
                    isLocked 
                      ? 'border-transparent opacity-85' 
                      : 'border-transparent hover:bg-slate-50 cursor-pointer active:scale-98'
                  } ${isTeam2Selected ? 'bg-emerald-50/50 border-emerald-300 ring-4 ring-[#00C853]/15' : ''}`}
                >
                  {renderTeamLogo(m.team2, m.team2Logo, "w-[150px] h-[150px] flex-shrink-0")}
                  <span className="text-sm font-black text-slate-950 mt-2.5 uppercase tracking-wider truncate w-full">
                    {m.team2}
                  </span>
                  {!isLocked && (
                    <span className={`text-[9px] uppercase font-black px-3 py-1 rounded-full mt-1.5 ${
                      isTeam2Selected 
                        ? 'bg-[#00C853] text-white' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isTeam2Selected ? 'Selected' : 'Pick'}
                    </span>
                  )}
                </button>

              </div>

              {/* Subtitle pick instructions */}
              <div className="text-center mt-3 mb-1">
                <p className="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase">
                  {isLocked ? '🔒 FORECAST SECURED' : '👉 TAP TEAM TO CHOOSE WINNER'}
                </p>
              </div>

              {/* 3. Compact Score Entry panel */}
              <div className="mt-4 py-3 px-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-4">
                <div className="text-left">
                  <h4 className="text-[11px] font-black text-slate-800 tracking-wide uppercase leading-tight">⚽ EXACT SCORE</h4>
                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 leading-tight">Bonus: +50 points!</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={0}
                      disabled={isLocked}
                      value={userPred ? (userPred.team1GoalsPredict ?? 0) : (team1GoalsDraft[m.matchId] ?? '')}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setTeam1GoalsDraft(prev => ({ ...prev, [m.matchId]: val }));
                      }}
                      placeholder="0"
                      className="w-10 h-8 bg-white text-slate-900 border border-slate-200 text-center text-xs font-black rounded-lg focus:outline-none focus:border-[#00C853] transition disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  <span className="text-xs font-extrabold text-slate-350">-</span>
                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={0}
                      disabled={isLocked}
                      value={userPred ? (userPred.team2GoalsPredict ?? 0) : (team2GoalsDraft[m.matchId] ?? '')}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setTeam2GoalsDraft(prev => ({ ...prev, [m.matchId]: val }));
                      }}
                      placeholder="0"
                      className="w-10 h-8 bg-white text-slate-900 border border-slate-200 text-center text-xs font-black rounded-lg focus:outline-none focus:border-[#00C853] transition disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Mini submission / lock status section */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col items-center justify-center">
                {userPred ? (
                  <div className="text-center py-2.5 px-4 bg-emerald-50 border border-emerald-200 rounded-xl inline-flex flex-col items-center gap-1 text-xs text-[#00C853] font-black w-full shadow-xs">
                    <div className="flex items-center gap-1.5 justify-center">
                      <CheckCircle className="w-4 h-4 text-[#00C853]" />
                      <span>Registered!</span>
                    </div>
                    <span className="text-[9px] text-slate-550 font-semibold truncate max-w-full block">
                      Pick: <strong className="text-[#00C853] uppercase">{userPred.predictedWinner === 'team1' ? m.team1 : (userPred.predictedWinner === 'draw' ? 'Draw' : m.team2)}</strong>
                        {(userPred.team1GoalsPredict !== null && userPred.team1GoalsPredict !== undefined && userPred.team2GoalsPredict !== null && userPred.team2GoalsPredict !== undefined) && (
                          <span> | Score: <strong>{userPred.team1GoalsPredict}-{userPred.team2GoalsPredict}</strong></span>
                        )}
                    </span>
                  </div>
                ) : isExpired ? (
                  <div className="text-center py-2.5 px-4 bg-amber-50 border border-amber-200 rounded-xl inline-flex items-center gap-2 text-[10px] text-amber-700 font-extrabold w-full justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Predictions Closed</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubmitPrediction(m.matchId)}
                    disabled={isSubmitting || (!draftChoice)}
                    className="w-full py-3 bg-[#00C853] hover:bg-[#00b049] disabled:opacity-40 disabled:hover:bg-[#00C853] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#00C853]/15 active:scale-95"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <span>
                        {draftChoice 
                          ? `Lock Pick: ${draftChoice === 'team1' ? m.team1 : m.team2}` 
                          : 'Make Prediction'}
                      </span>
                    )}
                  </button>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
