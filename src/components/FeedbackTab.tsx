import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Clock, 
  ShieldCheck,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { User } from 'firebase/auth';

interface FeedbackTabProps {
  currentUser?: User | null;
}

const CATEGORIES = [
  { id: 'General Feedback', label: 'General Feedback' },
  { id: 'Feature Request', label: 'Feature Request' },
  { id: 'Bug Report', label: 'Bug Report' },
  { id: 'Usability & UI', label: 'Usability & UI' },
  { id: 'Operating / Mileage', label: 'Operating / Mileage' },
  { id: 'Other', label: 'Other' },
];

export default function FeedbackTab({ currentUser }: FeedbackTabProps) {
  const defaultEmail = currentUser?.email || '';
  const [email, setEmail] = useState(defaultEmail);
  const [category, setCategory] = useState('General Feedback');
  const [feedback, setFeedback] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailGatewayWarning, setEmailGatewayWarning] = useState<string | null>(null);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setEmailGatewayWarning(null);

    const trimmedEmail = email.trim();
    const trimmedFeedback = feedback.trim();

    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address so our support team can reply to you.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address (e.g. name@domain.com).');
      return;
    }

    if (!trimmedFeedback) {
      setErrorMessage('Please enter your feedback or comments before submitting.');
      return;
    }

    if (trimmedFeedback.length < 5) {
      setErrorMessage('Please provide a little more detail in your feedback (at least 5 characters).');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          feedback: trimmedFeedback,
          category,
          userDisplayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
          userId: currentUser?.uid || '',
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit feedback. Please try again.');
      }

      setSubmitSuccess(true);
      if (data.emailError) {
        setEmailGatewayWarning(data.emailError);
      }
    } catch (err: any) {
      console.error('Feedback submit error:', err);
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFeedback('');
    setSubmitSuccess(false);
    setErrorMessage('');
    setEmailGatewayWarning(null);
  };

  const mailtoUrl = `mailto:support@transportlogic.com?subject=${encodeURIComponent(
    'Transport LogIQ Feedback'
  )}&body=${encodeURIComponent(
    `From: ${email}\nCategory: ${category}\n\n${feedback}\n\n[Submitted via Transport LogIQ]`
  )}`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 rounded-full text-xs font-semibold backdrop-blur-sm mb-3">
              <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              <span>Direct Support & Operator Feedback</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              We Value Your Feedback
            </h1>
            <p className="text-blue-100 text-sm mt-1.5 max-w-xl leading-relaxed">
              Have an idea for a feature, notice an issue, or want to share your experience? 
              Submissions are delivered directly to <strong className="text-white underline decoration-blue-300">support@transportlogic.com</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-white text-blue-600 flex items-center justify-center font-bold shrink-0 shadow-sm">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-blue-200 uppercase font-bold tracking-wider">Direct Inbox</p>
              <p className="text-sm font-bold text-white">support@transportlogic.com</p>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {submitSuccess ? (
          <motion.div
            key="success-card"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-sm text-center space-y-6"
          >
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl mx-auto flex items-center justify-center shadow-sm border border-green-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-xl md:text-2xl font-bold text-slate-900">
                Feedback Submitted!
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Thank you for taking the time to share your feedback. Your submission has been formatted and directed to <strong className="text-slate-900">support@transportlogic.com</strong>.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-lg mx-auto text-left text-xs text-slate-600 space-y-2">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-700">Submitter Email:</span>
                <span className="font-mono text-slate-900">{email}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-700">Subject:</span>
                <span className="font-medium text-slate-900">Transport LogIQ Feedback</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Category:</span>
                <span className="font-medium text-slate-900">{category}</span>
              </div>
            </div>

            {emailGatewayWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 max-w-lg mx-auto text-left text-xs text-amber-800 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Logged to Database</p>
                  <p className="text-amber-700 mt-0.5">
                    Your feedback is saved in our system. You can also open your personal email client to send a direct copy to <span className="font-semibold">support@transportlogic.com</span>.
                  </p>
                  <a
                    href={mailtoUrl}
                    className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 underline"
                  >
                    Open in Email App <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Submit Another Feedback</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Email Address */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    1. Your Email Address
                  </h2>
                  <p className="text-xs text-slate-500">
                    We will send responses and support updates to this address.
                  </p>
                </div>
              </div>

              <div>
                <label 
                  htmlFor="feedback-email-input" 
                  className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider"
                >
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="feedback-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. operator@transportlogic.com"
                    className="w-full px-4 py-3.5 pl-11 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-4 pointer-events-none" />
                </div>
                {currentUser?.email && email === currentUser.email && (
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                    Pre-filled with your verified account address
                  </p>
                )}
              </div>
            </div>

            {/* Section 2: Feedback Content */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    2. Enter Your Feedback
                  </h2>
                  <p className="text-xs text-slate-500">
                    Share your thoughts, suggestions, or describe any questions or issues.
                  </p>
                </div>
              </div>

              {/* Feedback Category selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">
                  Feedback Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feedback text area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label 
                    htmlFor="feedback-message-input" 
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                  >
                    Feedback Details <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {feedback.length} / 5000 characters
                  </span>
                </div>
                <textarea
                  id="feedback-message-input"
                  required
                  rows={6}
                  maxLength={5000}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us what's working well, what can be improved, or report any bugs you've observed..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all resize-y min-h-[140px]"
                />
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Error: </span>
                    {errorMessage}
                  </div>
                </div>
              )}

              {/* Action Bar / Submit Button */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>Subject: <strong className="text-slate-700">Transport LogIQ Feedback</strong></span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    id="submit-feedback-button"
                    type="submit"
                    disabled={isSubmitting || !feedback.trim() || !email.trim()}
                    className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending to Support...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Feedback</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Helper Note */}
            <div className="p-4 rounded-2xl bg-slate-100/70 border border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
              <span>
                Need urgent assistance? You can also email us directly at{' '}
                <a 
                  href="mailto:support@transportlogic.com?subject=Transport%20LogIQ%20Feedback" 
                  className="font-semibold text-blue-600 hover:underline"
                >
                  support@transportlogic.com
                </a>
              </span>
              <a 
                href={mailtoUrl}
                className="hidden sm:inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 font-medium"
              >
                <span>Draft in email client</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </form>
        )}
      </AnimatePresence>
    </div>
  );
}
