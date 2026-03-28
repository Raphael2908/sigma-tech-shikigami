export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full" style={{ fontFamily: "'IBM Plex Sans', Arial, sans-serif", background: "#f0ede8", color: "#2a2a2a", fontSize: 14 }}>
      {/* BizFile+ Header */}
      <header className="bg-white px-[50px] py-[11px] flex items-center justify-between border-b border-[#e5e5e5]">
        <div className="flex items-center gap-2.5">
          <div className="text-[21px] font-bold italic">
            <span className="text-[#c95200]">bizfile</span><span className="not-italic text-[#333]">+</span>
          </div>
          <div className="text-[11px] text-[#777]">Making Singapore the best place for business</div>
        </div>
        <div className="flex items-center gap-3.5 text-[13px] text-[#1e6070]">
          <span>Account</span><span>Logout</span>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-[#1e6070] flex items-center px-[50px]">
        {["Register", "Manage", "Annual filing", "Deregister", "Others", "|", "Buy information", "Subscribe APIs"].map((item, i) =>
          item === "|"
            ? <span key={i} className="text-white/30 px-1">|</span>
            : <span key={i} className="px-[13px] py-[11px] text-[13px] text-white cursor-pointer hover:bg-white/10">{item}</span>
        )}
      </nav>

      {children}

      {/* Footer */}
      <footer className="bg-[#2a2a2a] text-[#bbb] px-[50px] pt-7 pb-3.5 mt-9">
        <div className="flex justify-center gap-16 pb-[18px]">
          <div className="text-center">
            <div className="text-[18px] font-black tracking-widest text-[#aaa] border-2 border-[#666] inline-block px-[9px] py-1 mb-1">ACRA</div>
            <div className="text-[10px] text-[#888] max-w-[130px] leading-tight">Accounting and Corporate Regulatory Authority</div>
          </div>
        </div>
        <div className="border-t border-[#444] pt-[11px] flex justify-between text-[11.5px] text-[#777]">
          <div className="flex gap-[18px]">
            <span>Report vulnerability</span><span>Privacy statement</span><span>Terms of use</span>
          </div>
          <div>&copy; 2026 Government of Singapore</div>
        </div>
      </footer>
    </div>
  );
}
