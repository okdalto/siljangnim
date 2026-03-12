import { useState, useCallback } from "react";

const STEPS = [
  {
    title: "AI에게 설명하세요",
    desc: "채팅창에 원하는 비주얼을 자연어로 설명하면 AI가 코드를 생성합니다",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="12" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M16 22h8M16 28h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="36" cy="16" r="6" fill="var(--accent)" opacity="0.3" />
        <path d="M34 16l2 2 4-4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "실시간으로 확인하세요",
    desc: "뷰포트에서 결과가 바로 렌더링됩니다",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="8" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="24" cy="22" r="8" stroke="var(--accent)" strokeWidth="2" opacity="0.6" />
        <circle cx="24" cy="22" r="3" fill="var(--accent)" opacity="0.4" />
        <path d="M14 40h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "자유롭게 조절하세요",
    desc: "자동 생성된 슬라이더와 컨트롤로 파라미터를 조정할 수 있습니다",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="14" width="28" height="4" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="22" cy="16" r="3" fill="var(--accent)" opacity="0.6" />
        <rect x="10" y="24" width="28" height="4" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="30" cy="26" r="3" fill="var(--accent)" opacity="0.6" />
        <rect x="10" y="34" width="28" height="4" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="36" r="3" fill="var(--accent)" opacity="0.6" />
      </svg>
    ),
  },
];

export default function WelcomeModal({ onComplete }) {
  const [step, setStep] = useState(0);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onComplete();
  }, [step, onComplete]);

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm mx-4 flex flex-col items-center text-center"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
      >
        <div className="mb-5" style={{ color: "var(--chrome-text-muted)" }}>
          {current.icon}
        </div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--chrome-text)" }}>
          {current.title}
        </h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--chrome-text-secondary)" }}>
          {current.desc}
        </p>

        {/* Dot indicators */}
        <div className="flex gap-2 mb-5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ background: i === step ? "var(--accent)" : "var(--chrome-border)" }}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
        >
          {step < STEPS.length - 1 ? "다음" : "시작하기"}
        </button>
      </div>
    </div>
  );
}
