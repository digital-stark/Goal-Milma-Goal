import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, UserProfile, checkIsAdmin } from './firebase';
import AuthModal from './components/AuthModal';
import AdminAuthModal from './components/AdminAuthModal';
import LeaderboardView from './components/LeaderboardView';
import MatchList from './components/MatchList';
import AdminPanel from './components/AdminPanel';
import { 
  LogOut, 
  LogIn, 
  Settings, 
  Trophy, 
  ShieldAlert, 
  Award,
  Zap,
  Dribbble,
  User,
  Star,
  BookOpen,
  X,
  FileText,
  ShieldCheck
} from 'lucide-react';

const getYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const getGoogleDriveId = (url: string): string | null => {
  if (!url) return null;
  const matchD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD) return matchD[1];
  const matchOpen = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchOpen) return matchOpen[1];
  const matchPreview = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)\/preview/);
  if (matchPreview) return matchPreview[1];
  return null;
};

const normalizeMediaUrl = (url: string, type: 'image' | 'video' | 'youtube'): string => {
  if (!url) return '';
  const driveId = getGoogleDriveId(url);
  if (driveId) {
    if (type === 'image') {
      return `https://lh3.googleusercontent.com/d/${driveId}`;
    } else {
      return `https://drive.google.com/file/d/${driveId}/preview`;
    }
  }
  return url;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Modal controllers
  const [authOpen, setAuthOpen] = useState(false);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register' | 'admin-register'>('login');
  const [rulesOpen, setRulesOpen] = useState(false);
  
  // View Switch for Admin
  const [viewAdminMode, setViewAdminMode] = useState(false);

  // Dynamic Matches Countdown Label
  const [activeMatchesCount, setActiveMatchesCount] = useState<number>(0);

  // Active slide for rotating banners
  const [currentSlide, setCurrentSlide] = useState(0);

  // Hero Real-time Settings
  const [heroSettings, setHeroSettings] = useState<{
    heroBgType: 'image' | 'video' | 'youtube';
    heroBgUrl: string;
    heroBgUrls: string[];
    heroCentralLogo: string;
    heroTextTitle: string;
    heroTextSubtitle: string;
    heroTextDesc: string;
    heroBtnText: string;
    heroBgOpacity: number;
    heroPaddingTop: number;
    heroPaddingBottom: number;
    heroBtnSpacing: number;
    heroTextAlignment: 'left' | 'center' | 'right';
  }>({
    heroBgType: 'image',
    heroBgUrl: '',
    heroBgUrls: [],
    heroCentralLogo: '',
    heroTextTitle: 'PREDICT THE WINNER',
    heroTextSubtitle: 'WIN POINTS!',
    heroTextDesc: 'Predict the match winner and earn 10 points for each correct prediction.',
    heroBtnText: 'Join & Predict',
    heroBgOpacity: 35,
    heroPaddingTop: 80,
    heroPaddingBottom: 112,
    heroBtnSpacing: 8,
    heroTextAlignment: 'center',
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'hero'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setHeroSettings({
          heroBgType: d.heroBgType || 'image',
          heroBgUrl: d.heroBgUrl || '',
          heroBgUrls: d.heroBgUrls || [],
          heroCentralLogo: d.heroCentralLogo || '',
          heroTextTitle: d.heroTextTitle || 'PREDICT THE WINNER',
          heroTextSubtitle: d.heroTextSubtitle || 'WIN POINTS!',
          heroTextDesc: d.heroTextDesc || 'Predict the match winner and earn 10 points for each correct prediction.',
          heroBtnText: d.heroBtnText || 'Join & Predict',
          heroBgOpacity: typeof d.heroBgOpacity === 'number' ? d.heroBgOpacity : 35,
          heroPaddingTop: typeof d.heroPaddingTop === 'number' ? d.heroPaddingTop : 80,
          heroPaddingBottom: typeof d.heroPaddingBottom === 'number' ? d.heroPaddingBottom : 112,
          heroBtnSpacing: typeof d.heroBtnSpacing === 'number' ? d.heroBtnSpacing : 8,
          heroTextAlignment: d.heroTextAlignment || 'center',
        });
      }
    }, (err) => {
      console.error("Failed to load hero settings in App", err);
    });
    return () => unsub();
  }, []);

  // Sliding timer effect for background image rotating carousel
  useEffect(() => {
    const bannerLength = (heroSettings.heroBgUrls && heroSettings.heroBgUrls.length > 0)
      ? heroSettings.heroBgUrls.length
      : (heroSettings.heroBgUrl ? 1 : 0);

    if (heroSettings.heroBgType !== 'image' || bannerLength <= 1) {
      setCurrentSlide(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerLength);
    }, 4500); // cycle backgrounds smoothly every 4.5 seconds

    return () => clearInterval(interval);
  }, [heroSettings.heroBgType, heroSettings.heroBgUrls, heroSettings.heroBgUrl]);

  useEffect(() => {
    const q = query(collection(db, 'matches'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let activeCount = 0;
      snapshot.forEach((docRef) => {
        const d = docRef.data();
        const isExpired = (() => {
          const expirationTime = d.expiryDate ? new Date(d.expiryDate).getTime() : new Date(d.matchDate).getTime();
          return Date.now() > expirationTime;
        })();
        if (d.isActive === true && d.status === 'scheduled') {
          activeCount++;
        }
      });
      setActiveMatchesCount(activeCount);
    }, (error) => {
      console.error("Firestore matches checkout error", error);
    });
    return () => unsubscribe();
  }, []);

  // Authentication State Listener
  useEffect(() => {
    let profileUnsub: (() => void) | null = null;
    let adminUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      // Clean up previous real-time listeners if any
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
      if (adminUnsub) {
        adminUnsub();
        adminUnsub = null;
      }
      
      if (currentUser) {
        // Subscribing to client context profile info document in realtime
        const profileRef = doc(db, 'users', currentUser.uid);
        profileUnsub = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserProfile({
              uid: snap.id,
              fullname: data.fullname || '',
              username: data.username || '',
              email: data.email || '',
              instagramUrl: data.instagramUrl || '',
              points: data.points || 0,
              correctPredictions: data.correctPredictions || 0,
              createdAt: data.createdAt
            });
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
        });

        // Check if user is in 'admins' collection
        const adminRef = doc(db, 'admins', currentUser.uid);
        adminUnsub = onSnapshot(adminRef, (snap) => {
          if (snap.exists() || checkIsAdmin(currentUser.email)) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        }, (err) => {
          // Fallback to static check if read fails
          setIsAdmin(checkIsAdmin(currentUser.email));
        });
      } else {
        setUserProfile(null);
        setIsAdmin(false);
        setViewAdminMode(false);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsub) profileUnsub();
      if (adminUnsub) adminUnsub();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error", err);
    }
  };

  const openAuth = (mode: 'login' | 'register' | 'admin-register') => {
    setAuthInitialMode(mode);
    setAuthOpen(true);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleHeroCtaClick = () => {
    if (!user) {
      openAuth('login');
    } else {
      const el = document.getElementById('match-section-canvas');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  if (user && isAdmin && viewAdminMode) {
    return (
      <AdminPanel 
        onExit={() => setViewAdminMode(false)} 
        userEmail={user.email} 
        userProfile={userProfile}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#060C18] text-slate-100 flex flex-col font-sans selection:bg-[#00C853] selection:text-white">
      
      {/* HEADER BAR */}
      <header className="sticky top-0 z-50 bg-[#091122]/90 backdrop-blur-md border-b border-slate-900/60 px-4 md:px-8 py-4 flex justify-between items-center transition-all">
        
        {/* Navigation Left menu - Moved to left side, logo removed */}
        <nav className="flex items-center gap-4 sm:gap-7 text-[10px] sm:text-xs uppercase font-black text-slate-300 tracking-wider">
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
            className="hover:text-[#00C853] transition-colors relative py-1 cursor-pointer text-white"
          >
            Home
            <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-[#00C853] rounded-full"></span>
          </button>
          <button 
            onClick={() => scrollToSection('leaderboard-section')} 
            className="hover:text-white transition-colors py-1 cursor-pointer"
          >
            Leaderboard
          </button>
          <button 
            onClick={() => scrollToSection('how-to-play-section')} 
            className="hover:text-white transition-colors py-1 cursor-pointer"
          >
            How to Play
          </button>
          <button 
            onClick={() => setRulesOpen(true)} 
            className="hover:text-white transition-colors py-1 cursor-pointer"
          >
            Rules
          </button>
        </nav>

        {/* Authentication and profile module */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3 md:gap-4">
              
              {/* Score HUD */}
              <div className="flex items-center gap-2 bg-[#0d1c33] border border-slate-800/40 py-1.5 px-3 rounded-full">
                <span className="text-[10px] text-slate-400 block uppercase font-black">Score:</span>
                <span className="text-xs text-[#00C853] font-black">
                  {userProfile?.points || 0} PTS
                </span>
              </div>

              {/* Profile display */}
              <div className="hidden sm:block text-right">
                <span className="text-xs font-black text-white block max-w-[100px] truncate">
                  {userProfile?.fullname || user.displayName || 'Predictor'}
                </span>
                <span className="text-[9px] font-mono text-[#00C853] block">
                  @{userProfile?.username || 'user'}
                </span>
              </div>

              {/* Toggle admin view / logout */}
              {isAdmin && (
                <button
                  onClick={() => setViewAdminMode(!viewAdminMode)}
                  className={`p-2 rounded-lg border text-xs font-bold transition-all ${
                    viewAdminMode 
                      ? 'bg-[#00C853] border-[#00C853] text-white' 
                      : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                  title="Toggle Admin View"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 transition-all"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => openAuth('login')}
                className="px-4 py-1.5 border border-slate-700/60 rounded-lg text-slate-200 text-xs font-bold hover:bg-slate-900 hover:border-white transition-all cursor-pointer"
              >
                Login
              </button>
              <button
                onClick={() => openAuth('register')}
                className="px-4 py-1.5 bg-[#00C853] hover:bg-[#00b049] text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-lg shadow-[#00C853]/20"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </header>
      
      {(() => {
        const containerAlignmentClass = 
          heroSettings.heroTextAlignment === 'left' ? 'items-start text-left ml-0 mr-auto' :
          heroSettings.heroTextAlignment === 'right' ? 'items-end text-right ml-auto mr-0' :
          'items-center text-center mx-auto';

        const descAlignmentClass = 
          heroSettings.heroTextAlignment === 'left' ? 'mx-0 text-left' :
          heroSettings.heroTextAlignment === 'right' ? 'ml-auto mr-0 text-right' :
          'mx-auto text-center';

        const textAlignmentClass = 
          heroSettings.heroTextAlignment === 'left' ? 'text-left' :
          heroSettings.heroTextAlignment === 'right' ? 'text-right' :
          'text-center';

        const bgOpacity = typeof heroSettings.heroBgOpacity === 'number' ? heroSettings.heroBgOpacity / 100 : 0.35;
        const bannerImages = (heroSettings.heroBgUrls && heroSettings.heroBgUrls.length > 0)
          ? heroSettings.heroBgUrls
          : [heroSettings.heroBgUrl || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=1920'];
        const activeSlideIndex = currentSlide % bannerImages.length;

        return (
          /* HERO BANNER AREA - Dynamic Configuration */
          <section 
            className={`relative w-full aspect-video min-h-[340px] xs:min-h-[380px] sm:min-h-[440px] md:min-h-0 overflow-hidden flex flex-col justify-center px-0 ${textAlignmentClass}`}
            style={{ 
              paddingTop: `${heroSettings.heroPaddingTop ?? 80}px`, 
              paddingBottom: `${heroSettings.heroPaddingBottom ?? 112}px` 
            }}
          >
            {/* Background Media + Video - No padding/margins on parent or sides */}
            <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden m-0 p-0 w-full h-full bg-[#060C18]">
              {heroSettings.heroBgType === 'video' ? (
                (() => {
                  const driveId = getGoogleDriveId(heroSettings.heroBgUrl);
                  if (driveId) {
                    return (
                      <iframe
                        src={`https://drive.google.com/file/d/${driveId}/preview`}
                        className="absolute inset-0 w-full h-full pointer-events-none object-cover aspect-video border-0 m-0 p-0"
                        allow="autoplay; encrypted-media"
                        style={{ opacity: bgOpacity }}
                      />
                    );
                  }
                  return heroSettings.heroBgUrl ? (
                    <video 
                      src={heroSettings.heroBgUrl} 
                      autoPlay 
                      loop 
                      muted 
                      playsInline 
                      className="w-full h-full object-cover aspect-video border-0"
                      style={{ opacity: bgOpacity }}
                    />
                  ) : (
                    <img 
                      src="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=1920" 
                      alt="Default Stadium Backdrop fallback" 
                      className="w-full h-full object-cover aspect-video"
                      style={{ opacity: bgOpacity }}
                    />
                  );
                })()
              ) : heroSettings.heroBgType === 'youtube' ? (
                (() => {
                  const ytid = getYouTubeId(heroSettings.heroBgUrl);
                  return ytid ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${ytid}?autoplay=1&mute=1&playlist=${ytid}&loop=1&controls=0&playsinline=1&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1`}
                      className="absolute top-1/2 left-1/2 w-[125%] h-[125%] scale-[1.25] -translate-x-1/2 -translate-y-1/2 pointer-events-none object-cover aspect-video border-0 m-0 p-0"
                      allow="autoplay; encrypted-media"
                      style={{ opacity: bgOpacity }}
                    />
                  ) : (
                    <img 
                      src="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=1920" 
                      alt="Stadium backdrop fallback" 
                      className="w-full h-full object-cover aspect-video"
                      style={{ opacity: bgOpacity }}
                    />
                  );
                })()
              ) : (
                // Image Background type with Multiple Sliders Support
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                  {bannerImages.map((imgUrl, idx) => {
                    const normalizedUrl = normalizeMediaUrl(imgUrl, 'image');
                    return (
                      <img 
                        key={idx}
                        src={normalizedUrl} 
                        alt={`Stadium backdrop banner ${idx + 1}`} 
                        className="absolute inset-0 w-full h-full object-cover aspect-video transition-opacity duration-1000 ease-in-out"
                        style={{ 
                          opacity: idx === activeSlideIndex ? bgOpacity : 0,
                          zIndex: idx === activeSlideIndex ? 1 : 0 
                        }}
                      />
                    );
                  })}
                </div>
              )}
              {/* Aesthetic Shadow Overlays - Dynamically lightened if media opacity is increased */}
              <div 
                className="absolute inset-0 bg-gradient-to-t from-[#060C18] via-[#060C18]/80 to-[#091122]/90 transition-opacity duration-300 z-5" 
                style={{ opacity: Math.max(0.1, 1 - bgOpacity) }} 
              />
            </div>

            {/* Dynamic Hero Content - px-4 md:px-12 padding protects text alignment boundaries while video spans edge-to-edge */}
            <div className={`relative z-10 max-w-4xl space-y-4 md:space-y-6 flex flex-col ${containerAlignmentClass} w-full px-6 md:px-12`}>
              
              {/* Dynamic Central Corporate branding Logo / Image badge if uploaded */}
              {heroSettings.heroCentralLogo && (
                <div className="mb-2 animate-fade-in hover:scale-105 transition-transform duration-300">
                  <img 
                    src={normalizeMediaUrl(heroSettings.heroCentralLogo, 'image')} 
                    alt="Branding Emblem" 
                    className="max-h-24 sm:max-h-36 md:max-h-48 object-contain drop-shadow-[0_0_15px_rgba(0,200,83,0.25)]"
                  />
                </div>
              )}

              <div className="space-y-2 md:space-y-3.5 w-full">
                <h2 className="text-xl sm:text-3xl md:text-5xl font-black tracking-tight text-white uppercase font-sans drop-shadow-md">
                  {heroSettings.heroTextTitle}
                </h2>
                <h3 className="text-2xl sm:text-4xl md:text-6xl font-extrabold tracking-tight text-[#00C853] uppercase leading-none drop-shadow-[0_4px_12px_rgba(0,200,83,0.15)] bg-gradient-to-r from-emerald-400 via-[#00C853] to-green-300 bg-clip-text text-transparent">
                  {heroSettings.heroTextSubtitle}
                </h3>
                <p className={`text-xs sm:text-sm md:text-base text-slate-300 max-w-2xl font-medium leading-relaxed ${descAlignmentClass}`}>
                  {heroSettings.heroTextDesc}
                </p>
              </div>

              {/* Dynamic "Join the Contest" CTA action button */}
              <div style={{ marginTop: `${heroSettings.heroBtnSpacing ?? 8}px` }}>
                <button
                  onClick={handleHeroCtaClick}
                  className="px-6 py-3 sm:px-8 sm:py-4 bg-[#00C853] hover:bg-[#00b049] text-white font-black rounded-full uppercase tracking-widest text-[10px] sm:text-xs transition-all duration-300 cursor-pointer shadow-lg shadow-[#00C853]/25 active:scale-95 hover:shadow-xl hover:shadow-[#00C853]/40"
                >
                  {heroSettings.heroBtnText}
                </button>
              </div>

              {/* Slider pagination dashes style indicator */}
              <div className="flex justify-center items-center gap-1.5 pt-2 sm:pt-4 z-20">
                {heroSettings.heroBgType === 'image' && bannerImages.length > 1 ? (
                  bannerImages.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      onClick={() => setCurrentSlide(dotIdx)}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                        dotIdx === activeSlideIndex ? 'w-6 bg-[#00C853]' : 'w-2 bg-slate-600 hover:bg-slate-500'
                      }`}
                      title={`Go to slide ${dotIdx + 1}`}
                    />
                  ))
                ) : (
                  <>
                    <div className="w-6 h-1 bg-[#00C853] rounded-full"></div>
                    <div className="w-6 h-1 bg-slate-800 rounded-full"></div>
                  </>
                )}
              </div>

            </div>
          </section>
        );
      })()}

      {/* ARCHED ROUNDED CONTAINER OVERLAY */}
      <div className="w-full bg-[#F4F6F8] rounded-t-[40px] md:rounded-t-[50px] shadow-2xl relative z-10 -mt-10 pt-10 pb-16 flex-1 text-slate-800">
        
        <main className="max-w-7xl mx-auto px-4 md:px-6 space-y-10">
          
          {/* 1. ACTIVE MATCH */}
          <div id="match-section" className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                Open for Prediction
              </h2>
              <div className={`${activeMatchesCount > 0 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-150 text-slate-500 border-slate-200'} px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border transition-all duration-300`}>
                {activeMatchesCount === 1 ? '1 Match' : `${activeMatchesCount} Matches`}
              </div>
            </div>
            
            <MatchList 
              user={user} 
              userProfile={userProfile} 
              onOpenAuth={() => openAuth('login')} 
            />
          </div>

          {/* 2. THREE PROCESS STEPS SUMMARY ROW */}
          <div id="how-to-play-section" className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm shadow-[#E2E8F0]/30 p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 md:divide-x md:divide-slate-100">
            
            {/* Step 1 */}
            <div className="flex items-center gap-4 px-2">
              <div className="w-12 h-12 rounded-full bg-[#E8F8EE] text-[#00C853] flex-shrink-0 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 leading-tight">1. Login / Register</h4>
                <p className="text-xs text-slate-500 mt-1">Create your account or login to continue</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-4 md:pl-6 px-2">
              <div className="w-12 h-12 rounded-full bg-[#E8F8EE] text-[#00C853] flex-shrink-0 flex items-center justify-center">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 leading-tight">2. Predict Winner</h4>
                <p className="text-xs text-slate-500 mt-1">Choose the team you think will win the match</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-4 md:pl-6 px-2">
              <div className="w-12 h-12 rounded-full bg-[#E8F8EE] text-[#00C853] flex-shrink-0 flex items-center justify-center">
                <Star className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 leading-tight">3. Earn Points</h4>
                <p className="text-xs text-slate-500 mt-1">Get 10 points for each correct prediction</p>
              </div>
            </div>

          </div>

          {/* 3. LEADERBOARD */}
          <div id="leaderboard-section" className="space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#00C853] uppercase tracking-widest pl-2">
              <span className="w-2 h-2 rounded-full bg-[#00C853] inline-block"></span>
              Leaderboard
            </div>
            
            <LeaderboardView isAdmin={checkIsAdmin(user?.email)} />
          </div>
        </main>
      </div>

      {/* FOOTER BAR */}
      <footer className="bg-[#091122] text-slate-400 border-t border-slate-900 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          
          {/* Footer Brand Logo */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#00C853] text-white">
                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4M6,8A2,2 0 0,1 8,10A2,2 0 0,1 6,12A2,2 0 0,1 4,10A2,2 0 0,1 6,8M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M18,8A2,2 0 0,1 20,10A2,2 0 0,1 18,12A2,2 0 0,1 16,10A2,2 0 0,1 18,8M8,14A2,2 0 0,1 10,16A2,2 0 0,1 8,18A2,2 0 0,1 6,16A2,2 0 0,1 8,14M16,14A2,2 0 0,1 18,16A2,2 0 0,1 16,18A2,2 0 0,1 14,16A2,2 0 0,1 16,14Z" />
                </svg>
              </div>
              <span className="text-sm font-extrabold text-white tracking-widest uppercase">Football Predict & Win</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Predict the winner. Earn points. Be the champion!</p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-6 text-xs font-bold text-slate-400">
            <button onClick={() => setRulesOpen(true)} className="hover:text-white transition-colors cursor-pointer">Rules</button>
            {/* <button onClick={() => openAuth('admin-register')} className="hover:text-emerald-400 transition-colors cursor-pointer text-[#00C853]">Admin Access</button> */}
            <button onClick={() => alert("Privacy Policy:\n\nAll predictions are final and processed real-time. No shared cookie vectors are passed to external entities.")} className="hover:text-white transition-colors cursor-pointer">Privacy Policy</button>
            <button onClick={() => alert("Terms of Use:\n\nOne account is allowed per user. Exploitation of prediction submission parameters is strictly moderated by ABAC policies.")} className="hover:text-white transition-colors cursor-pointer">Terms of Use</button>
            <button onClick={() => alert("Contact Us:\n\nSend support tickets or administrative queries to admin@predict-win-league.com")} className="hover:text-white transition-colors cursor-pointer">Contact Us</button>
          </div>

        </div>

        <div className="text-center text-[10px] text-slate-600 mt-8 max-w-5xl mx-auto border-t border-slate-900/60 pt-6">
          Championship Predictor © {new Date().getFullYear()} • Securely verified ABAC policy • Powered by Firebase Firestore and Cloud Run
        </div>
      </footer>

      {/* RULES TOOLTIP MODAL */}
      {rulesOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 relative shadow-xl">
            <button 
              onClick={() => setRulesOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="text-[#00C853] w-5 h-5" />
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider">Prediction Rules</h3>
            </div>
            
            <ul className="space-y-3 text-xs text-slate-300 list-disc pl-5 leading-relaxed">
              <li>Each correctly predicted football match winner awards exactly <strong>10 points</strong>.</li>
              <li>Incorrect predictions or draws award <strong>0 points</strong> (no deductions).</li>
              <li>Predictions must be submitted <strong>before kickoff date and time</strong>. Once locked, choices are final and cannot be altered.</li>
              <li>Leaderboard is sorted dynamically by Points, with Correct Predictions count serving as the primary tiebreaker.</li>
              <li>Multiple account usage to stack leaderboard results holds strict account termination penalties.</li>
            </ul>

            <button 
              onClick={() => setRulesOpen(false)}
              className="w-full mt-6 py-2.5 bg-[#00C853] hover:bg-[#00b049] text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors"
            >
              Understand & Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* AUTHENTICATION CONTEXT DIALOG MODAL */}
      <AuthModal 
        isOpen={authOpen} 
        onClose={() => setAuthOpen(false)} 
        initialMode={authInitialMode}
      />

      <AdminAuthModal isOpen={adminAuthOpen} onClose={() => setAdminAuthOpen(false)} />
      
      <button onClick={() => setAdminAuthOpen(true)} className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg z-40 transition-all">
        <ShieldCheck className="w-6 h-6" />
      </button>

    </div>
  );
}
