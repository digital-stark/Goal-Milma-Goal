import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { X, Lock, Mail, User, ShieldCheck, Instagram, AlertTriangle, Eye, EyeOff, Phone } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'forgot' | 'admin-register';
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'admin-register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // MFA Flow States
  const [mfaResolver, setMfaResolver] = useState<any>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPhoneSelected, setMfaPhoneSelected] = useState<any>(null);

  // Form states
  const [phoneNumber, setPhoneNumber] = useState('');
  const [instagram, setInstagram] = useState('');
  // Admin flow states
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sync mode with initialMode as modal opens
  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, initialMode]);

  // Clean messages on tab change
  React.useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [mode]);

  if (!isOpen) return null;

  const handleReset = () => {
    setError(null);
    setSuccess(null);
    setFullname('');
    setPhoneNumber('');
    setInstagram('');
    setEmail('');
    setPassword('');
  };

  const handleRegisterPredictor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic Input Validation
    const sanitizedPhone = phoneNumber.trim().replace(/[^0-9]/g, '');
    if (sanitizedPhone.length < 8) {
      setError("Please enter a valid phone number with at least 8 digits.");
      setLoading(false);
      return;
    }

    const cleanInstagram = instagram.trim();
    if (!cleanInstagram) {
      setError("Instagram profile is a mandatory field.");
      setLoading(false);
      return;
    }

    const sanitizedUsername = cleanInstagram.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    if (sanitizedUsername.length < 2) {
      setError("Please enter a valid Instagram profile.");
      setLoading(false);
      return;
    }

    const bgEmail = `${sanitizedPhone}@predict.com`;
    const bgPassword = "predictorPass123!"; // Deterministic background password

    try {
      // 1. Enforce unique username checks
      const usernameRef = doc(db, 'usernames', sanitizedUsername);
      const usernameDoc = await getDoc(usernameRef);
      if (usernameDoc.exists()) {
        setError("This Instagram profile is already registered. Please log in with your phone number.");
        setLoading(false);
        return;
      }

      // 2. Auth call
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, bgEmail, bgPassword);
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          throw new Error("This phone number is already registered.");
        }
        if (authErr.code === 'auth/operation-not-allowed') {
          throw new Error("Phone/Email registration is currently disabled in Firebase Console. Please ask the administrator to enable Email/Password Authentication.");
        }
        throw authErr;
      }

      const user = userCredential.user;

      // 3. Update auth profile display name
      await updateProfile(user, { displayName: cleanInstagram });

      // 4. Save predictor profile
      const batch = writeBatch(db);

      const userDocRef = doc(db, 'users', user.uid);
      batch.set(userDocRef, {
        uid: user.uid,
        fullname: cleanInstagram,
        username: sanitizedUsername,
        email: bgEmail,
        instagramUrl: cleanInstagram,
        phoneNumber: sanitizedPhone,
        points: 0,
        correctPredictions: 0,
        createdAt: serverTimestamp()
      });

      const leaderboardDocRef = doc(db, 'leaderboard', user.uid);
      batch.set(leaderboardDocRef, {
        username: cleanInstagram,
        points: 0,
        correctPredictions: 0
      });

      const usernameDocRef = doc(db, 'usernames', sanitizedUsername);
      batch.set(usernameDocRef, {
        email: bgEmail
      });

      await batch.commit();

      setSuccess("Account registered successfully! Welcome!");
      setTimeout(() => {
        onClose();
        handleReset();
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic Input Validation for Admin
    if (!email.includes('@')) {
      setError("Invalid email address format.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    try {
      // Auth call
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          throw new Error("This email address is already registered.");
        }
        throw authErr;
      }

      const user = userCredential.user;

      // Update auth profile display name
      await updateProfile(user, { displayName: fullname });

      // Save Admin profile
      await setDoc(doc(db, 'admins', user.uid), {
        uid: user.uid,
        fullname,
        email: email.trim().toLowerCase(),
        createdAt: serverTimestamp()
      });

      setSuccess("Admin account registered successfully!");
      setTimeout(() => {
        onClose();
        handleReset();
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Error occurred during admin registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const sanitizedPhone = phoneNumber.trim().replace(/[^0-9]/g, '');
    if (!sanitizedPhone) {
      setError("Please enter your registered phone number.");
      setLoading(false);
      return;
    }

    const loginEmail = `${sanitizedPhone}@predict.com`;
    const loginPassword = "predictorPass123!";

    try {
      // Authenticate with phone deterministic credential
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setSuccess("Successfully logged in!");
      setTimeout(() => {
        onClose();
        handleReset();
      }, 1000);

    } catch (err: any) {
      console.error('Login error details:', err.code, err.message);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Login failed: Phone number is not registered.");
      } else if (err.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err);
        setMfaResolver(resolver);
        setMfaPhoneSelected(resolver.hints[0]);
        setError("Two-Step Verification (MFA) is required. Please follow the prompt below.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("Sign-in is currently disabled in Firebase Console. Please contact support.");
      } else {
        setError(`Login failed: ${err.message || 'Unknown error occurred.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
    if (!mfaResolver || !mfaPhoneSelected) return;
    setLoading(true);
    setError(null);
    try {
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
      
      const phoneInfoOptions = {
        multiFactorHint: mfaPhoneSelected,
        session: mfaResolver.session
      };
      
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
      setMfaVerificationId(verificationId);
      setSuccess("Verification code sent!");
    } catch (err: any) {
      console.error("MFA Send Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("SMS/Phone authentication is not enabled or the region is not allowed in your Firebase Console. Developers: Please enable 'Phone' in the Firebase Auth 'Sign-in method' tab and ensure SMS regions are configured.");
      } else {
        setError(`Failed to send code: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || !mfaVerificationId || !mfaCode) return;
    setLoading(true);
    setError(null);
    try {
      const cred = PhoneAuthProvider.credential(mfaVerificationId, mfaCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      
      const result = await mfaResolver.resolveSignIn(multiFactorAssertion);
      const user = result.user;

      setSuccess("Verification successful! Logged in.");
      setTimeout(() => {
        onClose();
        handleReset();
        setMfaResolver(null);
        setMfaVerificationId(null);
        setMfaCode('');
      }, 1200);

    } catch (err: any) {
      console.error("MFA Verify Error:", err);
      setError(`Verification failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-modal-v1" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden text-stone-900 flex flex-col md:flex-row my-8">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 md:top-6 md:right-6 p-2 rounded-full hover:bg-stone-150 transition-colors z-20 bg-stone-100 md:bg-transparent"
        >
          <X className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        {/* Left: Login */}
        <div className={`w-full md:w-1/2 p-6 md:p-10 bg-white flex flex-col justify-center ${
          mode === 'register' ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-stone-950 mb-1 md:mb-2">Welcome Back!</h2>
            <p className="text-stone-500 text-sm">Enter your phone number to login</p>
          </div>

          {/* Feedback Section Left */}
          {error && mode !== 'register' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-250 text-red-600 text-xs font-semibold rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500 animate-pulse" />
              <span>{error}</span>
            </div>
          )}
          {success && mode !== 'register' && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs font-semibold rounded-xl">
              {success}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs md:text-sm font-semibold text-stone-700 mb-1.5">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-stone-400"><Phone className="w-4 h-4 md:w-5 md:h-5" /></span>
                <input 
                  type="tel" 
                  required 
                  value={phoneNumber} 
                  onChange={(e) => setPhoneNumber(e.target.value)} 
                  placeholder="Eg: 9876543210" 
                  className="w-full pl-10 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-hidden" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-xs md:text-sm cursor-pointer"
            >
              {loading ? "Authenticating..." : "Login"}
            </button>
          </form>
          
          <p className="mt-6 md:mt-8 text-center text-xs md:text-sm text-stone-600">
            Don't have an account?{' '}
            <button 
              type="button"
              onClick={() => setMode('register')} 
              className="text-emerald-600 font-bold hover:underline cursor-pointer"
            >
              Register
            </button>
          </p>
        </div>

        {/* Divider */}
        <div className="hidden md:flex items-center justify-center relative">
          <div className="w-10 h-10 rounded-full border border-stone-100 flex items-center justify-center text-stone-400 text-xs font-bold bg-white absolute z-10">OR</div>
        </div>

        {/* Right: Register */}
        <div className={`w-full md:w-1/2 p-6 md:p-10 bg-stone-50 flex flex-col justify-center border-t md:border-t-0 md:border-l border-stone-100 ${
          mode !== 'register' ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-stone-950 mb-1 md:mb-2">Create Account</h2>
            <p className="text-stone-500 text-sm">Join Predictor and start winning</p>
          </div>

          {/* Feedback Section Right */}
          {error && mode === 'register' && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-800 text-xs font-semibold rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600 animate-pulse" />
              <span>{error}</span>
            </div>
          )}
          {success && mode === 'register' && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs font-semibold rounded-xl">
              {success}
            </div>
          )}

          <form onSubmit={handleRegisterPredictor} className="space-y-4">
            <div>
              <label className="block text-xs md:text-sm font-semibold text-stone-700 mb-1.5">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-stone-400"><Phone className="w-4 h-4" /></span>
                <input 
                  type="tel" 
                  required 
                  value={phoneNumber} 
                  onChange={(e) => setPhoneNumber(e.target.value)} 
                  placeholder="Eg: 9876543210" 
                  className="w-full pl-10 pr-4 py-1.5 text-sm bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-hidden" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-semibold text-stone-700 mb-1.5">Instagram Profile</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-stone-400"><Instagram className="w-4 h-4" /></span>
                <input 
                  type="text" 
                  required 
                  value={instagram} 
                  onChange={(e) => setInstagram(e.target.value)} 
                  placeholder="Eg: @username" 
                  className="w-full pl-10 pr-4 py-1.5 text-sm bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-hidden" 
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-[#00C853] hover:bg-[#00b049] disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-[#00C853]/15 text-xs md:text-sm cursor-pointer mt-1"
            >
              {loading ? "Registering account..." : "Register"}
            </button>

            <p className="text-center text-[11px] text-stone-500 pt-1">
              By registering, you agree to our{' '}
              <a href="#" className="text-emerald-600 underline">Terms of Use</a> and{' '}
              <a href="#" className="text-emerald-600 underline">Privacy Policy</a>
            </p>
          </form>

          <p className="mt-4 text-center text-xs md:text-sm text-stone-600 md:hidden">
            Already have an account?{' '}
            <button 
              type="button"
              onClick={() => setMode('login')} 
              className="text-emerald-600 font-bold hover:underline cursor-pointer"
            >
              Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

