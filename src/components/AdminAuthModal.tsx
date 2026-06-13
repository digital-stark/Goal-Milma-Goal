import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  signOut
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, checkIsAdmin } from '../firebase';
import { X, Lock, Mail, User, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminAuthModal({ isOpen, onClose }: AdminAuthModalProps) {
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  
  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register State
  const [fullname, setFullname] = useState('');
  const [username, setUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // MFA Flow States
  const [mfaResolver, setMfaResolver] = useState<any>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPhoneSelected, setMfaPhoneSelected] = useState<any>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginLoading(true);
      setLoginError(null);
      try {
        const credential = loginEmail.trim();
        let emailToSignIn = credential;

        // Check if username mapping is needed
        if (!credential.includes('@')) {
          const usernameClean = credential.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
          const usernameRef = doc(db, 'usernames', usernameClean);
          const usernameDoc = await getDoc(usernameRef);
          
          if (!usernameDoc.exists()) {
             throw new Error("Username not found on the platform.");
          }
          emailToSignIn = usernameDoc.data()?.email;
        }

        const loginCred = await signInWithEmailAndPassword(auth, emailToSignIn, loginPassword);
        const loggedUser = loginCred.user;

        // Verify registration approval rule
        const isSuper = checkIsAdmin(loggedUser.email);
        if (!isSuper) {
          const mAdminDoc = await getDoc(doc(db, 'admins', loggedUser.uid));
          if (!mAdminDoc.exists() || mAdminDoc.data()?.approved !== true) {
            await signOut(auth);
            throw new Error("Access Denied: Admin access is pending Super Admin approval. Please contact the administrator.");
          }
        }

        onClose();
      } catch (err: any) {
        console.error("Link Admin login error:", err);
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          setLoginError("Login failed: Invalid credentials provided.");
        } else if (err.code === 'auth/multi-factor-auth-required') {
          const resolver = getMultiFactorResolver(auth, err);
          setMfaResolver(resolver);
          setMfaPhoneSelected(resolver.hints[0]);
          setLoginError("Multi-Factor Authentication (MFA) is required for admin access.");
        } else {
          setLoginError(err.message || "An error occurred during login.");
        }
      } finally {
        setLoginLoading(false);
      }
  };

  const handleSendMfaCode = async () => {
    if (!mfaResolver || !mfaPhoneSelected) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'admin-recaptcha-container', {
        size: 'invisible'
      });
      
      const phoneInfoOptions = {
        multiFactorHint: mfaPhoneSelected,
        session: mfaResolver.session
      };
      
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
      setMfaVerificationId(verificationId);
    } catch (err: any) {
      console.error("Admin MFA Send Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setLoginError("SMS/Phone authentication is not enabled or the region is not allowed in your Firebase Console. Admins: Please enable 'Phone' in Firebase Auth 'Sign-in method' and check SMS regions.");
      } else {
        setLoginError(`Failed to send verification code: ${err.message}`);
      }
    } finally {
      setLoginLoading(false);
    }
  }

  const handleVerifyMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || !mfaVerificationId || !mfaCode) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const cred = PhoneAuthProvider.credential(mfaVerificationId, mfaCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      
      const result = await mfaResolver.resolveSignIn(multiFactorAssertion);
      const user = result.user;

      // Verify approval check
      const isSuper = checkIsAdmin(user.email);
      if (!isSuper) {
        const mAdminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (!mAdminDoc.exists() || mAdminDoc.data()?.approved !== true) {
          await signOut(auth);
          throw new Error("Access Denied: Admin access is pending Super Admin approval. Please contact the administrator.");
        }
      }

      onClose();
      // Reset MFA state
      setMfaResolver(null);
      setMfaVerificationId(null);
      setMfaCode('');

    } catch (err: any) {
      console.error("Admin MFA Verify Error:", err);
      setLoginError(`Verification failed: ${err.message}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setRegisterLoading(true);
      setRegisterError(null);

      const sanitizedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
      if (sanitizedUsername.length < 3) {
         setRegisterError("Username must be at least 3 characters and contain only alphanumeric symbols.");
         setRegisterLoading(false);
         return;
      }

      if (regPassword !== confirmPassword) {
         setRegisterError("Passwords do not match");
         setRegisterLoading(false);
         return;
      }

      if (regPassword.length < 6) {
         setRegisterError("Password must be at least 6 characters.");
         setRegisterLoading(false);
         return;
      }

      try {
          // 1. Check uniqueness of username
          const usernameRef = doc(db, 'usernames', sanitizedUsername);
          const usernameDoc = await getDoc(usernameRef);
          if (usernameDoc.exists()) {
              setRegisterError("This username is already taken. Please choose another.");
              setRegisterLoading(false);
              return;
          }

          // 2. Create the user authentication record
          const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
          const user = cred.user;

          const isSuper = checkIsAdmin(regEmail.trim().toLowerCase());

          // 3. Update auth profile display name using username as display name
          await updateProfile(user, { displayName: sanitizedUsername });

          // 4. Create batch records so admin is fully synced across the system
          const batch = writeBatch(db);

          const adminDocRef = doc(db, 'admins', user.uid);
          batch.set(adminDocRef, {
              uid: user.uid,
              fullname: sanitizedUsername,
              username: sanitizedUsername,
              email: regEmail.trim().toLowerCase(),
              approved: isSuper,
              createdAt: serverTimestamp()
          });

          const userDocRef = doc(db, 'users', user.uid);
          batch.set(userDocRef, {
              uid: user.uid,
              fullname: sanitizedUsername,
              username: sanitizedUsername,
              email: regEmail.trim().toLowerCase(),
              instagramUrl: 'https://instagram.com/',
              points: 0,
              correctPredictions: 0,
              createdAt: serverTimestamp()
          });

          const leaderboardDocRef = doc(db, 'leaderboard', user.uid);
          batch.set(leaderboardDocRef, {
              username: sanitizedUsername,
              points: 0,
              correctPredictions: 0
          });

          const usernameDocRef = doc(db, 'usernames', sanitizedUsername);
          batch.set(usernameDocRef, {
              email: regEmail.trim().toLowerCase()
          });

          await batch.commit();
          onClose();
      } catch (err: any) {
          console.error("Admin registration error:", err);
          if (err.code === 'auth/email-already-in-use') {
             // Let's attempt to promote the existing user to admin by signing them in and creating the admin records!
             try {
                // Try signing in using the entered regEmail and regPassword
                const loginCred = await signInWithEmailAndPassword(auth, regEmail.trim(), regPassword);
                const user = loginCred.user;
                
                // If this succeeds, they entered the CORRECT credentials for this email! We can promote them safely.
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                let actualUsername = sanitizedUsername;
                let actualFullname = fullname;
                
                if (userDoc.exists()) {
                   const uData = userDoc.data();
                   if (uData.username) actualUsername = uData.username;
                   if (uData.fullname) actualFullname = uData.fullname;
                }
                
                // Now create/set the Admin document for this user to elevate them
                const batch = writeBatch(db);
                
                const adminDocRef = doc(db, 'admins', user.uid);
                batch.set(adminDocRef, {
                    uid: user.uid,
                    fullname: actualFullname,
                    username: actualUsername,
                    email: regEmail.trim().toLowerCase(),
                    createdAt: serverTimestamp()
                });
                
                // Ensure user's profile is fully flushed to users table if they were incomplete
                if (!userDoc.exists()) {
                   batch.set(userDocRef, {
                       uid: user.uid,
                       fullname: actualFullname,
                       username: actualUsername,
                       email: regEmail.trim().toLowerCase(),
                       instagramUrl: 'https://instagram.com/',
                       points: 0,
                       correctPredictions: 0,
                       createdAt: serverTimestamp()
                   });
                   const leaderboardDocRef = doc(db, 'leaderboard', user.uid);
                   batch.set(leaderboardDocRef, {
                       username: actualUsername,
                       points: 0,
                       correctPredictions: 0
                   });
                   const usernameRef = doc(db, 'usernames', actualUsername);
                   batch.set(usernameRef, {
                       email: regEmail.trim().toLowerCase()
                   });
                }
                
                await batch.commit();
                onClose();
             } catch (signInErr: any) {
                console.error("Failed existing account password verification for admin promotion:", signInErr);
                setRegisterError("This email is already registered. If this is your account and you want to activate Admin privileges on it, please enter its correct password in the password fields above to authorize promotion, or use the left panel to log in.");
             }
          } else {
             setRegisterError(err.message || "An error occurred during registration.");
          }
      } finally {
          setRegisterLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div id="admin-recaptcha-container"></div>
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden text-stone-900 flex">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-stone-100 transition-colors z-30"><X className="w-6 h-6"/></button>
        
        {/* MFA Overlay */}
        {mfaResolver && (
          <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center">
            <div className="w-full max-w-sm">
              <ShieldCheck className="w-16 h-16 text-blue-600 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-2">Admin Verification</h2>
              <p className="text-stone-500 text-sm mb-8">
                {!mfaVerificationId 
                  ? `Security code will be sent to phone ending in ${mfaPhoneSelected?.phoneNumber?.slice(-4)}`
                  : `Enter the code sent to your phone`
                }
              </p>

              {!mfaVerificationId ? (
                <button
                  onClick={handleSendMfaCode}
                  disabled={loginLoading}
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loginLoading ? "Sending Code..." : "Send Verification Code"}
                </button>
              ) : (
                <form onSubmit={handleVerifyMfaCode} className="space-y-4">
                  <input
                    type="text"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="6-digit code"
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-center text-2xl font-mono tracking-widest"
                    maxLength={6}
                  />
                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {loginLoading ? "Verifying..." : "Verify & Log In"}
                  </button>
                </form>
              )}

              <button
                onClick={() => setMfaResolver(null)}
                className="mt-6 text-stone-500 hover:text-stone-800 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        <div className="w-1/2 p-10 bg-white flex flex-col justify-center relative">
            <div className="flex justify-center mb-6"><div className="p-3 bg-blue-50 rounded-full text-blue-600"><Lock className="w-8 h-8"/></div></div>
            <h2 className="text-2xl font-extrabold text-center mb-2">Login to Admin Panel</h2>
            <p className="text-center text-stone-500 mb-6">Enter your credentials to continue</p>
            
            {loginError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1">Email or Username</label>
                   <input type="text" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Enter email or username" className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
                   <div className="relative">
                     <input type={showLoginPassword ? "text" : "password"} required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Enter your password" className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                     <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-2.5 text-stone-400">{showLoginPassword ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}</button>
                   </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <label className="flex items-center gap-2"><input type="checkbox"/> Remember me</label>
                   <button type="button" className="text-blue-600 font-semibold underline">Forgot Password?</button>
                </div>
                <button type="submit" disabled={loginLoading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl transition hover:bg-blue-700 disabled:opacity-50">
                  {loginLoading ? "Logging in..." : "Login"}
                </button>
            </form>
            <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3 text-sm text-blue-800">
                <Lock className="flex-shrink-0 w-8 h-8 text-blue-600"/>
                <div><strong>This is a secure area.</strong><br/>Unauthorized access is strictly prohibited.</div>
            </div>
            <p className="mt-8 text-center text-sm">Don't have an account? <span className="text-blue-600 font-semibold cursor-pointer underline">Register</span></p>
        </div>
        
        {/* Divider */}
        <div className="flex items-center justify-center relative z-10 w-0">
            <div className="w-10 h-10 -ml-5 rounded-full border border-stone-100 flex items-center justify-center text-stone-500 text-xs font-bold bg-stone-50 absolute">OR</div>
        </div>
        
        {/* Right: Register */}
        <div className="w-1/2 p-10 bg-stone-50 flex flex-col justify-center border-l border-stone-100/50">
             <div className="flex justify-center mb-6"><div className="p-3 bg-green-50 rounded-full text-green-600"><User className="w-8 h-8"/></div></div>
            <h2 className="text-2xl font-extrabold text-center mb-2">Create Admin Account</h2>
            <p className="text-center text-stone-500 mb-6">Fill in the details to create your account</p>
            
            {registerError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl">
                {registerError}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Username</label>
                    <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                    <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Enter email address" className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
                    <div className="relative">
                      <input type={showRegPassword ? "text" : "password"} required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Create a password" className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl" />
                      <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="absolute right-3 top-2.5 text-stone-400">{showRegPassword ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}</button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Confirm Password</label>
                    <div className="relative">
                      <input type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm your password" className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-2.5 text-stone-400">{showConfirmPassword ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}</button>
                    </div>
                </div>
                <button type="submit" disabled={registerLoading} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl transition hover:bg-green-700 disabled:opacity-50">
                  {registerLoading ? "Registering..." : "Register"}
                </button>
            </form>
            <p className="mt-6 text-center text-xs text-stone-500">By registering, you agree to our <a href="#" className="underline">Terms of Use</a> and <a href="#" className="underline">Privacy Policy</a></p>
        </div>
      </div>
    </div>
  );
}
