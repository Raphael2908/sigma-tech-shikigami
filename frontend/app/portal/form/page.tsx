"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function PortalFormPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState("11 Mar 2026");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [suppFile, setSuppFile] = useState<File | null>(null);
  const formFileRef = useRef<HTMLInputElement>(null);
  const suppFileRef = useRef<HTMLInputElement>(null);

  const handleReview = () => {
    sessionStorage.setItem("form_email", email);
    sessionStorage.setItem("form_desc", desc);
    sessionStorage.setItem("form_date", date);
    if (formFile) sessionStorage.setItem("form_file_name", formFile.name);
    if (suppFile) sessionStorage.setItem("supp_file_name", suppFile.name);
    router.push("/portal/review");
  };

  return (
    <>
      {/* Breadcrumb */}
      <div className="px-[50px] py-[11px] text-[13px] text-[#999]">
        <span className="text-[#2c7a87] cursor-pointer hover:underline">Home</span>
        <span className="mx-1.5 text-[11px]">&rsaquo;</span>
        <span>General lodgement</span>
      </div>

      <div className="px-[50px] pb-[18px]">
        <h1 className="text-[26px] font-bold leading-tight">Update registered qualified<br />individual information</h1>
      </div>

      {/* Stepper */}
      <div className="px-[50px] pb-4">
        <div className="flex items-start max-w-[560px]">
          <StepCircle num={1} active label="Enter General lodgement details" />
          <div className="flex-1 h-px bg-[#ccc] mt-4 min-w-[50px]" />
          <StepCircle num={2} label="Review and confirm" />
          <div className="flex-1 h-px bg-[#ccc] mt-4 min-w-[50px]" />
          <StepCircle num={3} label="Complete" />
        </div>
      </div>

      {/* Form Card */}
      <div className="px-[50px] pb-10">
        <div className="bg-white rounded-[10px] shadow-sm p-[28px_32px_32px]">
          <div className="text-[19px] font-semibold mb-1">Enter general lodgement information</div>
          <div className="text-[13px] text-[#888] mb-5">This eService allows you to file transactions through general lodgement.</div>

          {/* Entity Info */}
          <SectionTitle>Entity information</SectionTitle>
          <div className="grid grid-cols-4 gap-3.5 py-1.5 pb-1">
            {[["UEN", "N/A"], ["Entity name", "N/A"], ["Entity type", "N/A"], ["Company type", "N/A"]].map(([lbl, val]) => (
              <div key={lbl}><div className="text-[11px] text-[#aaa] mb-[3px]">{lbl}</div><div className="text-sm text-[#333]">{val}</div></div>
            ))}
          </div>

          {/* General Lodgement */}
          <SectionTitle>General lodgement</SectionTitle>
          <div className="mb-3.5">
            <div className="text-[11px] text-[#aaa] mb-[3px]">Date of lodgement</div>
            <div className="text-sm text-[#333]">28 Mar 2026</div>
          </div>

          <div className="max-w-[400px]">
            <FormField label="Email address">
              <input id="f-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Jerometeoh@gmail.com"
                className="w-full px-3 py-2.5 border border-[#ccc] rounded-[5px] text-sm focus:outline-none focus:border-[#1e6070] focus:ring-2 focus:ring-[rgba(30,96,112,0.1)]" />
            </FormField>
            <FormField label="Description of lodgement">
              <textarea id="f-desc" value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 200))}
                className="w-full px-3 py-2.5 border border-[#ccc] rounded-[5px] text-sm min-h-[85px] resize-y focus:outline-none focus:border-[#1e6070] focus:ring-2 focus:ring-[rgba(30,96,112,0.1)]" />
              <div className="text-right text-[11px] text-[#bbb] mt-[3px]">{desc.length}/200</div>
            </FormField>
            <FormField label="Date of document">
              <input id="f-date" type="text" value={date} onChange={(e) => setDate(e.target.value)}
                placeholder="DD MMM YYYY"
                className="w-full px-3 py-2.5 border border-[#ccc] rounded-[5px] text-sm focus:outline-none focus:border-[#1e6070] focus:ring-2 focus:ring-[rgba(30,96,112,0.1)]" />
            </FormField>
          </div>

          {/* Uploads */}
          <SectionTitle>Supporting document</SectionTitle>
          <div className="flex gap-[26px]">
            <div className="w-[195px] shrink-0 text-[12.5px] text-[#888] leading-relaxed">
              Download the PDF form available on the instruction page. Complete and upload the PDF form as part of your submission.
            </div>
            <div className="flex-1">
              <UploadZone label="Attach form" accept=".pdf" maxFiles={1} maxSize="3MB"
                file={formFile} onFile={setFormFile} inputRef={formFileRef} />
              <UploadZone label="Attach supporting document" accept=".pdf" maxFiles={20} maxSize="2MB"
                file={suppFile} onFile={setSuppFile} inputRef={suppFileRef} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-[18px] border-t border-[#eee] mt-2">
            <span className="px-[22px] py-2.5 rounded-full text-[13.5px] font-medium border-[1.5px] border-[#1e6070] text-[#1e6070] bg-white cursor-pointer hover:bg-[#f0f8fa]">
              &larr; Back
            </span>
            <div className="flex gap-2.5">
              <button className="px-[22px] py-2.5 rounded-full text-[13.5px] font-medium border-[1.5px] border-[#1e6070] text-[#1e6070] bg-white hover:bg-[#f0f8fa]">
                Save draft
              </button>
              <button onClick={handleReview}
                className="px-[22px] py-2.5 rounded-full text-[13.5px] font-medium border-[1.5px] border-[#1e6070] bg-[#1e6070] text-white hover:bg-[#164d5c]">
                Review and confirm &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] font-semibold mt-5 mb-[11px] pb-2 border-b border-[#eee] first:mt-0">{children}</div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-[17px]"><label className="block text-xs text-[#777] mb-[5px]">{label}</label>{children}</div>;
}

function StepCircle({ num, active, label }: { num: number; active?: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[13px] font-bold mb-[5px] ${
        active ? "bg-[#1e6070] border-[#1e6070] text-white" : "border-[#ccc] bg-white text-[#aaa]"
      }`}>{num}</div>
      <div className={`text-[11px] text-center max-w-[90px] leading-tight ${active ? "text-[#333] font-semibold" : "text-[#999]"}`}>{label}</div>
    </div>
  );
}

function UploadZone({ label, accept, maxFiles, maxSize, file, onFile, inputRef }: {
  label: string; accept: string; maxFiles: number; maxSize: string;
  file: File | null; onFile: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="mb-3">
      <span className="block text-xs text-[#999] mb-[7px]">{label}</span>
      <div className="border-2 border-dashed border-[#ccc] rounded-md p-5 text-center bg-[#fafafa] cursor-pointer relative hover:border-[#1e6070] hover:bg-[#f0f8fa]"
        onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept={accept} className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
        {file ? (
          <div className="text-[38px] leading-none mb-2.5">&#128077;</div>
        ) : (
          <svg className="mx-auto mb-2.5" width="42" height="42" viewBox="0 0 42 42" fill="none">
            <rect x="17" y="24" width="8" height="12" rx="1" fill="#7bbccc"/>
            <polygon points="21,4 7,22 15,22 15,36 27,36 27,22 35,22" fill="#7bbccc"/>
            <rect x="7" y="34" width="28" height="3" rx="1.5" fill="#7bbccc"/>
          </svg>
        )}
        <div className="text-[13px] text-[#444]">
          {file ? file.name : <>Drag and drop files here or <span className="text-[#2c7a87]">browse files</span> to upload</>}
        </div>
        <div className="text-[11.5px] text-[#999] mt-1 leading-relaxed">
          Supported formats: PDF | Maximum file size: {maxSize} per file<br />
          <em>You may upload up to {maxFiles} file(s)</em>
        </div>
      </div>
      {file && (
        <div className="flex items-center gap-2.5 bg-white border border-[#ddd] rounded-[5px] p-[9px_13px] mt-1.5 text-[13px]">
          <span className="text-[#1e6070]">&#128196;</span>
          <div className="flex-1">
            <div className="text-[#2c7a87] font-medium">{file.name}</div>
            <div className="text-[11px] text-[#bbb] mt-0.5">Uploaded &bull; {(file.size / 1024).toFixed(1)} KB</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onFile(null); }} className="text-[#ccc] hover:text-[#e05555] text-[17px]">&#128465;</button>
        </div>
      )}
    </div>
  );
}
