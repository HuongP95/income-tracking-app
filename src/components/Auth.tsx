import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { motion } from 'motion/react';
import { Coins, Sparkles, Heart, Mail, Lock, Eye, EyeOff, Smile, Flame } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [floatingItems, setFloatingItems] = useState<Array<{ id: number; left: number; delay: number; duration: number; text: string; size: number }>>([]);

  // Generate falling coin/money elements for background effect
  useEffect(() => {
    const items = Array.from({ length: 28 }, (_, i) => {
      const texts = ['💵', '💸', '🪙', '💰', '✨', '🍀', '🌸'];
      return {
        id: i,
        left: Math.random() * 100, // percentage width
        delay: Math.random() * 6,
        duration: 6 + Math.random() * 9, // seconds to fall
        text: texts[Math.floor(Math.random() * texts.length)],
        size: 14 + Math.random() * 22, // font size
      };
    });
    setFloatingItems(items);
  }, []);

  const handleForgotPassword = async () => {
    setError('');
    setResetSuccess('');
    if (!email.trim()) {
      setError('Bạn vui lòng nhập Email ở trên trước rồi nhấn "Quên mật khẩu?" nhé! 💌');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSuccess('Bé Coin đã gửi liên kết đặt lại mật khẩu vào Email của bạn rồi đó! Bạn kiểm tra hộp thư (hoặc mục Spam/Rác) nha 📩✨');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Email này chưa được đăng ký trong hệ thống bạn ơi! 😿');
      } else if (err.code === 'auth/invalid-email') {
        setError('Địa chỉ email không đúng định dạng kìa bạn ơi! 💌');
      } else {
        setError('Có lỗi xảy ra khi gửi email đặt lại mật khẩu: ' + err.message);
      }
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccess('');
    setIsSubmitting(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      let vietnameseError = err.message;
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        vietnameseError = 'Hình như email hoặc mật khẩu chưa đúng rồi nè... Bạn kiểm tra lại nha! 👉👈';
      } else if (err.code === 'auth/email-already-in-use') {
        vietnameseError = 'Email này đã được đăng ký mất rồi! Thử đăng nhập xem sao nha 🌸';
      } else if (err.code === 'auth/weak-password') {
        vietnameseError = 'Mật khẩu cần dài từ 6 ký tự trở lên nha bạn ơi! 📋';
      } else if (err.code === 'auth/invalid-email') {
        vietnameseError = 'Email không hợp lệ rồi kìa, điền đúng định dạng nha! 💌';
      }
      setError(vietnameseError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-[#FFFDF9] via-[#FFF9F2] to-[#FFF3E3] p-4 overflow-hidden">
      
      {/* Background Falling Money & Sparkles Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {floatingItems.map((item) => (
          <motion.div
            key={item.id}
            initial={{ y: -80, opacity: 0, rotate: 0 }}
            animate={{
              y: '110vh',
              x: [0, Math.sin(item.id) * 40, -Math.sin(item.id) * 20, 0],
              opacity: [0, 1, 1, 0],
              rotate: [0, 180, 360 * (item.id % 2 === 0 ? 1 : -1)]
            }}
            transition={{
              duration: item.duration,
              repeat: Infinity,
              delay: item.delay,
              ease: 'linear'
            }}
            className="absolute text-2xl select-none"
            style={{
              left: `${item.left}%`,
              fontSize: `${item.size}px`,
            }}
          >
            {item.text}
          </motion.div>
        ))}
      </div>

      {/* Adorable Animated Clouds in Background */}
      <motion.div 
        animate={{ x: [-10, 10, -10] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-12 left-10 md:left-24 text-4xl opacity-40 select-none pointer-events-none hidden sm:block"
      >
        ☁️
      </motion.div>
      <motion.div 
        animate={{ x: [10, -10, 10] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-20 right-10 md:right-24 text-4xl opacity-40 select-none pointer-events-none hidden sm:block"
      >
        ☁️
      </motion.div>

      {/* Main Cute Login Container */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md space-y-7 rounded-3xl bg-white/95 backdrop-blur-md p-8 sm:p-10 shadow-xl shadow-[#FFE6C7]/30 border-4 border-[#FFF2D8] z-10"
      >
        {/* Heart Accents */}
        <div className="absolute -top-3 -right-3 text-2xl animate-pulse">💖</div>
        <div className="absolute -bottom-3 -left-3 text-2xl animate-pulse delay-75">🍀</div>

        {/* Adorable Money Mascot Header */}
        <div className="flex flex-col items-center text-center">
          
          {/* Animated Mascot Coin Wrapper */}
          <div className="relative">
            {/* Soft shadow that expands and contracts as coin floats */}
            <motion.div 
              animate={{ scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-14 h-1.5 bg-amber-200/50 blur-[2px] rounded-full"
            />
            
            {/* Friendly smiling floating gold coin */}
            <motion.div
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-20 h-20 bg-gradient-to-b from-[#FFE45E] to-[#FFC300] rounded-full flex items-center justify-center shadow-md shadow-amber-300/40 border-4 border-white cursor-pointer"
              whileHover={{ scale: 1.1, rotate: 15 }}
            >
              {/* Star sparkles orbiting */}
              <span className="absolute -top-1 -right-1 text-base animate-bounce">✨</span>
              <span className="absolute -bottom-1 -left-1 text-base animate-bounce delay-150">🌟</span>

              {/* Adorable Face on Gold Coin */}
              <div className="relative flex flex-col items-center justify-center w-full h-full select-none">
                {/* Shiny highlight */}
                <div className="absolute top-1.5 left-3 w-4 h-2 bg-white/60 rounded-full rotate-[-15deg]" />
                
                {/* Dollar sign on forehead */}
                <span className="text-xs font-black text-amber-800 leading-none mb-1 mt-1">$</span>
                
                {/* Kawaii Eyes and Smile */}
                <div className="flex space-x-3.5 mb-1">
                  {/* Left Eye */}
                  <div className="relative w-2 h-2 bg-slate-900 rounded-full flex items-center justify-center">
                    <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white rounded-full" />
                  </div>
                  {/* Right Eye */}
                  <div className="relative w-2 h-2 bg-slate-900 rounded-full flex items-center justify-center">
                    <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white rounded-full" />
                  </div>
                </div>
                
                {/* Happy Rosy Cheeks */}
                <div className="absolute flex justify-between w-11 top-[42px]">
                  <div className="w-2.5 h-1.5 bg-[#FF809B] rounded-full opacity-70 blur-[0.5px]" />
                  <div className="w-2.5 h-1.5 bg-[#FF809B] rounded-full opacity-70 blur-[0.5px]" />
                </div>

                {/* Cute Smiling Mouth */}
                <div className="w-2.5 h-1.5 border-b-2 border-slate-900 rounded-b-full -mt-0.5" />
              </div>
            </motion.div>
          </div>

          <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-1.5">
            {isLogin ? 'Chào mừng bạn đến với Finly!' : 'Gia nhập nhà Finly nha!'}
            <span className="animate-wiggle">👋</span>
          </h2>
          <p className="mt-1.5 text-xs text-amber-700/80 font-bold px-4">
            {isLogin ? 'Hãy đăng nhập để cùng bé Coin quản lý chi tiêu kute lơ mơ nhé! 🐾' : 'Cùng tạo chiếc tài khoản thật xinh để tiết kiệm mỗi ngày nào! ✨'}
          </p>
        </div>

        {/* Auth Form */}
        <form className="space-y-4" onSubmit={handleAuth}>
          <div className="space-y-3.5">
            
            {/* Email Field Container */}
            <div>
              <label className="block text-[11px] font-bold text-amber-800/80 uppercase tracking-widest mb-1.5 ml-1">Địa chỉ Email 🐾</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-amber-500/80" />
                </div>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-3 rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] text-slate-800 placeholder:text-amber-600/30 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Password Field Container */}
            <div>
              <div className="flex justify-between items-center mb-1.5 ml-1 pr-1">
                <label className="block text-[11px] font-bold text-amber-800/80 uppercase tracking-widest">Mật khẩu yêu thương 🔐</label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-900 hover:underline cursor-pointer"
                  >
                    Quên mật khẩu?
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-amber-500/80" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-11 py-3 rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] text-slate-800 placeholder:text-amber-600/30 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-amber-500/60 hover:text-amber-500 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Reset Password Success Message */}
          {resetSuccess && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-emerald-50 border-2 border-emerald-200 p-3 rounded-2xl text-xs text-emerald-800 font-bold text-center flex items-center justify-center gap-1.5"
            >
              <span>📩</span>
              <p>{resetSuccess}</p>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-rose-50 border-2 border-rose-100 p-3 rounded-2xl text-xs text-rose-600 font-bold text-center flex items-center justify-center gap-1.5"
            >
              <span>😿</span>
              <p>{error}</p>
            </motion.div>
          )}

          {/* Form Action Button */}
          <div className="pt-2">
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative overflow-hidden flex w-full justify-center items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] py-3.5 px-4 text-sm font-black text-amber-950 shadow-md shadow-amber-200/50 hover:shadow-lg hover:shadow-amber-200/60 transition-all border-b-4 border-amber-600 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-amber-950 border-t-transparent rounded-full animate-spin" />
                  <span>Đợi bé xíu nha...</span>
                </div>
              ) : (
                <>
                  <Coins className="w-4.5 h-4.5 text-amber-950 animate-bounce" />
                  <span>{isLogin ? 'Đăng nhập ngay thôi!' : 'Đăng ký tài khoản nha!'}</span>
                </>
              )}
            </motion.button>
          </div>
          
          {/* Switch Mode Toggle */}
          <div className="text-center pt-2">
            <button
              type="button"
              className="text-xs font-bold text-amber-700 hover:text-amber-900 hover:underline cursor-pointer flex items-center justify-center gap-1.5 mx-auto transition-colors"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setResetSuccess('');
              }}
            >
              <span>{isLogin ? '🌸 Chưa có tài khoản? Đăng ký tại đây nè' : '🐾 Đã có tài khoản rồi? Đăng nhập ngay'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
