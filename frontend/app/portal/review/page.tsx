"use client";

import { useEffect, useState } from "react";

export default function PortalReviewPage() {
  const [formData, setFormData] = useState({ email: "-", desc: "-", date: "-", formFile: "", suppFile: "" });
  const [submitted, setSubmitted] = useState(false);
  const [declChecked, setDeclChecked] = useState(false);

  useEffect(() => {
    setFormData({
      email: sessionStorage.getItem("form_email") || "-",
      desc: sessionStorage.getItem("form_desc") || "-",
      date: sessionStorage.getItem("form_date") || "-",
      formFile: sessionStorage.getItem("form_file_name") || "",
      suppFile: sessionStorage.getItem("supp_file_name") || "",
    });
  }, []);

  const handleSubmit = () => {
    if (!declChecked) { alert("Please check the declaration box."); return; }
    sessionStorage.clear();
    setSubmitted(true);
    window.scrollTo(0, 0);
  };

  if (submitted) {
    return (
      <div className="px-[50px] py-10">
        {/* Stepper - all done */}
        <div className="px-0 pb-4">
          <div className="flex items-start max-w-[560px]">
            {[1, 2, 3].map((n) => (
              <div key={n} className="contents">
                {n > 1 && <div className="flex-1 h-px bg-[#1e6070] mt-4 min-w-[50px]" />}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full bg-[#1e6070] border-2 border-[#1e6070] text-white flex items-center justify-center text-[13px] font-bold mb-[5px]">&#10003;</div>
                  <div className="text-[11px] text-[#1e6070] text-center max-w-[90px] leading-tight">
                    {n === 1 ? "Enter details" : n === 2 ? "Review" : "Complete"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-[10px] shadow-sm max-w-[700px] mx-auto text-center p-12">
          <div className="text-[48px] mb-4">&#10004;&#65039;</div>
          <h2 className="text-[22px] font-bold mb-2">Submission Successful</h2>
          <div className="bg-[#e8f5e9] border border-[#c8e6c9] rounded-lg p-4 inline-block mb-6">
            <div className="text-[11px] text-[#888] mb-1">Reference number</div>
            <div className="text-[20px] font-bold text-[#1e6070] tracking-wide">GL-2026-0328-001</div>
          </div>
          <p className="text-[13px] text-[#666] max-w-[500px] mx-auto mb-6">
            Our officers will review your submission and process it accordingly.
            If payment is required, we will notify you after accepting the transaction.
          </p>
          <a href="/portal/form" className="inline-block px-6 py-2.5 rounded-full text-[13.5px] font-medium bg-[#1e6070] text-white hover:bg-[#164d5c]">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="px-[50px] py-[11px] text-[13px] text-[#999]">
        <span className="text-[#2c7a87] cursor-pointer">Home</span>
        <span className="mx-1.5 text-[11px]">&rsaquo;</span>
        <span>General lodgement</span>
      </div>

      <div className="px-[50px] pb-[18px]">
        <h1 className="text-[26px] font-bold leading-tight">Update registered qualified<br />individual information</h1>
      </div>

      {/* Stepper */}
      <div className="px-[50px] pb-4">
        <div className="flex items-start max-w-[560px]">
          <StepDone num={1} label="Enter details" />
          <div className="flex-1 h-px bg-[#1e6070] mt-4 min-w-[50px]" />
          <StepActive num={2} label="Review and confirm" />
          <div className="flex-1 h-px bg-[#ccc] mt-4 min-w-[50px]" />
          <StepPending num={3} label="Complete" />
        </div>
      </div>

      <div className="px-[50px] pb-10">
        <div className="bg-white rounded-[10px] shadow-sm p-[28px_32px_32px]">
          <div className="text-[19px] font-semibold mb-1">Review and confirm</div>
          <div className="text-[13px] text-[#888] mb-5">Please review the information below before submitting.</div>

          <ReviewSection title="Entity information">
            <ReviewGrid cols={4}>
              {[["UEN", "N/A"], ["Entity name", "N/A"], ["Entity type", "N/A"], ["Company type", "N/A"]].map(([l, v]) => (
                <ReviewField key={l} label={l} value={v} />
              ))}
            </ReviewGrid>
          </ReviewSection>

          <ReviewSection title="General lodgement">
            <ReviewGrid cols={2}>
              <ReviewField label="Date of lodgement" value="28 Mar 2026" />
              <ReviewField label="Email address" value={formData.email} />
              <ReviewField label="Description of lodgement" value={formData.desc} />
              <ReviewField label="Date of document" value={formData.date} />
            </ReviewGrid>
          </ReviewSection>

          <ReviewSection title="Supporting documents">
            <ReviewGrid cols={2}>
              <ReviewField label="Attach form" value={formData.formFile || "N/A"} isLink={!!formData.formFile} />
              <ReviewField label="Attach supporting document" value={formData.suppFile || "N/A"} isLink={!!formData.suppFile} />
            </ReviewGrid>
          </ReviewSection>

          {/* Declaration */}
          <div className="border-2 border-[#1e6070] rounded-lg p-5 mt-5">
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={declChecked} onChange={(e) => setDeclChecked(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#1e6070]" />
              <div>
                <div className="text-sm font-semibold mb-2">Declaration by: Lim Ming-Yang, Raphael</div>
                <ul className="text-[13px] text-[#555] list-disc pl-5 space-y-1.5">
                  <li>The information submitted is true and correct, and I am authorised to file this transaction.</li>
                  <li>I am aware that it is an offence to provide false or misleading information.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-[18px] border-t border-[#eee] mt-5">
            <a href="/portal/form" className="px-[22px] py-2.5 rounded-full text-[13.5px] font-medium border-[1.5px] border-[#1e6070] text-[#1e6070] bg-white hover:bg-[#f0f8fa]">
              &larr; Back
            </a>
            <button onClick={handleSubmit}
              className="px-[22px] py-2.5 rounded-full text-[13.5px] font-medium border-[1.5px] border-[#1e6070] bg-[#1e6070] text-white hover:bg-[#164d5c]">
              Submit &rarr;
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function StepDone({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="w-8 h-8 rounded-full bg-[#1e6070] border-2 border-[#1e6070] text-white flex items-center justify-center text-[13px] font-bold mb-[5px]">&#10003;</div>
      <div className="text-[11px] text-[#1e6070] text-center max-w-[90px] leading-tight">{label}</div>
    </div>
  );
}

function StepActive({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="w-8 h-8 rounded-full bg-[#1e6070] border-2 border-[#1e6070] text-white flex items-center justify-center text-[13px] font-bold mb-[5px]">{num}</div>
      <div className="text-[11px] text-[#333] font-semibold text-center max-w-[90px] leading-tight">{label}</div>
    </div>
  );
}

function StepPending({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="w-8 h-8 rounded-full border-2 border-[#ccc] bg-white text-[#aaa] flex items-center justify-center text-[13px] font-bold mb-[5px]">{num}</div>
      <div className="text-[11px] text-[#999] text-center max-w-[90px] leading-tight">{label}</div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="text-[15px] font-semibold pb-2 border-b border-[#eee] mb-3">{title}</div>
      {children}
    </div>
  );
}

function ReviewGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div className={`grid gap-3.5 py-1.5 ${cols === 4 ? "grid-cols-4" : "grid-cols-2"}`}>{children}</div>;
}

function ReviewField({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[#aaa] mb-[3px]">{label}</div>
      <div className={`text-sm ${isLink ? "text-[#2c7a87] font-medium" : "text-[#333]"}`}>{value}</div>
    </div>
  );
}
