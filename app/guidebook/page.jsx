"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import API from "@/services/api";
import CopyReplyButton from "@/components/CopyReplyButton";

const CATEGORY_LABELS = {
    poor_service: "Poor Service",
    pricing: "Pricing / Refund",
    delay: "Delay / No Update",
    technical_issue: "Technical Issue",
    complaint: "General Complaint",
    scam_fraud: "Scam / Fraud",
    accusation: "Accusation",
    angry_customer: "Angry Customer",
};

function mergeEntries(allEntries, pageId) {
    const global = allEntries.filter((e) => !e.pageId);
    const scoped = pageId ? allEntries.filter((e) => e.pageId === pageId) : [];
    const byCategory = new Map(global.map((e) => [e.category, { ...e, scope: "global" }]));
    for (const e of scoped) {
        byCategory.set(e.category, { ...e, scope: "account" });
    }
    return [...byCategory.values()].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export default function GuidebookPage() {
    const searchParams = useSearchParams();
    const initialPageId = searchParams.get("pageId") || "";
    const dashboardHref = initialPageId
        ? `/accounts/${initialPageId}`
        : "/accounts";
    const replyDeskHref = initialPageId
        ? `/accounts/${initialPageId}/comments`
        : "/accounts";

    const [accounts, setAccounts] = useState([]);
    const [pageId, setPageId] = useState(initialPageId);
    const [entries, setEntries] = useState([]);
    const [playbookMeta, setPlaybookMeta] = useState(null);
    const [playbookDraft, setPlaybookDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [savingPlaybook, setSavingPlaybook] = useState(false);
    const [showAccountCustomize, setShowAccountCustomize] = useState(false);
    const [testText, setTestText] = useState("");
    const [testResult, setTestResult] = useState(null);
    const [testing, setTesting] = useState(false);

    const merged = useMemo(() => mergeEntries(entries, pageId || null), [entries, pageId]);
    const accountName = accounts.find((a) => a.pageId === pageId)?.name;
    const isGlobal = !pageId;

    const fetchAccounts = async () => {
        try {
            const res = await API.get("/comments/accounts");
            setAccounts(res.data?.data || res.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const url = pageId ? `/comments/guidebook/list?pageId=${pageId}` : "/comments/guidebook/list";
            const res = await API.get(url);
            setEntries(res.data.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPlaybook = async () => {
        try {
            const url = pageId ? `/comments/playbook/${pageId}` : "/comments/playbook/global";
            const res = await API.get(url);
            const data = res.data.data;
            setPlaybookMeta(data);
            setPlaybookDraft(data.playbook);
            setShowAccountCustomize(Boolean(pageId && data.usesAccountOverrides));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { fetchAccounts(); }, []);
    useEffect(() => {
        fetchEntries();
        fetchPlaybook();
    }, [pageId]);

    const handleSavePlaybook = async () => {
        if (!playbookDraft) return;
        setSavingPlaybook(true);
        try {
            const payload = {
                replyCta: playbookDraft.replyCta,
                replyCtaUrgent: playbookDraft.replyCtaUrgent,
                neutralLeadsEnabled: playbookDraft.neutralLeadsEnabled,
                leadInquiryTriggers: playbookDraft.leadInquiryTriggers || [],
                brandDisplayName: playbookDraft.brandDisplayName || "",
            };
            if (isGlobal) {
                await API.put("/comments/playbook/global", payload);
            } else {
                await API.put(`/comments/playbook/${pageId}`, payload);
                setShowAccountCustomize(true);
            }
            alert(isGlobal ? "Global playbook saved — applies to all accounts." : "Account override saved.");
            fetchPlaybook();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setSavingPlaybook(false);
        }
    };

    const handleResetAccountPlaybook = async () => {
        if (!pageId) return;
        if (!confirm("Remove account-specific playbook overrides and use global settings again?")) return;
        try {
            await API.delete(`/comments/playbook/${pageId}`);
            setShowAccountCustomize(false);
            fetchPlaybook();
            alert("Account now uses global playbook.");
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        }
    };

    const handleSaveEntry = async (entry) => {
        try {
            const payload = {
                ...entry,
                triggers: entry.triggers.split(",").map((t) => t.trim()).filter(Boolean),
                exampleComments: (entry.exampleComments || "")
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
            };
            delete payload.scope;
            if (pageId && entry.scope === "global") {
                await API.post(`/comments/guidebook/override/${pageId}/${entry.category}`, payload);
            } else {
                await API.put(`/comments/guidebook/${entry._id}`, payload);
            }
            alert("Saved!");
            setSelected(null);
            fetchEntries();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        }
    };

    const runTestComment = async () => {
        if (!testText.trim()) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await API.post("/comments/test", { text: testText.trim(), pageId: pageId || undefined });
            setTestResult(res.data.result);
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f5f0] font-['DM_Sans',sans-serif]">
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

            <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href={dashboardHref} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">
                            ← Dashboard
                        </Link>
                        {pageId && (
                            <Link href={replyDeskHref} className="px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-semibold hover:bg-violet-100">
                                Reply Desk
                            </Link>
                        )}
                    </div>
                    <div className="flex-1">
                        <h1 className="font-['Syne'] text-xl font-bold text-gray-900">Reply Guidebook</h1>
                        <p className="text-xs text-gray-500">Configure once globally — every account inherits automatically</p>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
                {/* Test comment */}
                <div className="bg-white rounded-2xl border border-indigo-200 p-5 space-y-3">
                    <h2 className="font-semibold text-gray-900">Test a comment</h2>
                    <p className="text-xs text-gray-500">See category, triggers, and suggested reply before saving guidebook changes.</p>
                    <textarea
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        rows={3}
                        placeholder='e.g. "mere pasise kha gaye yeh" or "I want loan please help"'
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
                    />
                    <button
                        type="button"
                        onClick={runTestComment}
                        disabled={testing || !testText.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {testing ? "Analyzing…" : "Analyze"}
                    </button>
                    {testResult && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm space-y-2">
                            <p><span className="text-indigo-600 font-medium">Sentiment:</span> {testResult.analysis?.sentiment}</p>
                            {testResult.isLeadInquiry && (
                                <p className="text-sky-700 font-medium">→ Lead inquiry (no CS reply suggested)</p>
                            )}
                            {testResult.analysis?.matchedCategory && (
                                <p><span className="text-indigo-600 font-medium">Category:</span> {CATEGORY_LABELS[testResult.analysis.matchedCategory] || testResult.analysis.matchedCategory}</p>
                            )}
                            {testResult.matchedGuidebooks?.length > 0 && (
                                <p className="text-xs text-indigo-800">
                                    <span className="font-medium">Matches:</span>{" "}
                                    {testResult.matchedGuidebooks.map((m) => `${m.label}${m.isPrimary ? " ★" : ""} (${m.confidence}%)`).join(" · ")}
                                </p>
                            )}
                            {testResult.analysis?.matchedTriggers?.length > 0 && (
                                <p className="text-xs text-indigo-700 break-words">
                                    <span className="font-medium">Triggers:</span> {testResult.analysis.matchedTriggers.join(" · ")}
                                </p>
                            )}
                            {testResult.complaintFallbackUsed && (
                                <p className="text-amber-800 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                    ⚠ Generic complaint fallback used — add triggers or examples.
                                </p>
                            )}
                            {testResult.reply?.suggestedReply ? (
                                <div className="mt-2 pt-2 border-t border-indigo-100">
                                    <p className="text-[10px] font-bold uppercase text-indigo-700 mb-1">Suggested reply</p>
                                    <div className="relative rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 pr-14">
                                        <CopyReplyButton
                                            text={testResult.reply.suggestedReply}
                                            className="absolute top-1.5 right-1.5 z-10"
                                        />
                                        <p className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap">
                                            {testResult.reply.suggestedReply}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 italic">No suggested reply (lead or neutral comment).</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Account picker — for preview / optional overrides only */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <label className="text-xs text-gray-400 uppercase font-semibold">Preview settings for</label>
                    <select
                        value={pageId}
                        onChange={(e) => setPageId(e.target.value)}
                        className="w-full mt-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium"
                    >
                        <option value="">All accounts (global defaults)</option>
                        {accounts.map((a) => (
                            <option key={a.pageId} value={a.pageId}>{a.name || a.pageId}</option>
                        ))}
                    </select>
                    {isGlobal ? (
                        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mt-3">
                            ✓ Changes here apply to <strong>every account</strong> automatically. Switch accounts in Reply Desk — no re-setup needed.
                        </p>
                    ) : (
                        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mt-3">
                            <strong>{accountName}</strong> inherits global settings.
                            Brand in replies: <strong>{playbookMeta?.playbook?.brandDisplayName || accountName}</strong> (from page name).
                            {playbookMeta?.usesAccountOverrides
                                ? " This account has custom overrides."
                                : " No account-specific setup required."}
                        </p>
                    )}
                </div>

                {/* Playbook editor */}
                {playbookDraft && (isGlobal || showAccountCustomize) && (
                    <div className="bg-white rounded-2xl border border-violet-200 p-5 space-y-4">
                        <h2 className="font-semibold text-gray-900">
                            {isGlobal ? "Global reply playbook" : "Account-specific overrides"}
                        </h2>
                        {!isGlobal && (
                            <p className="text-xs text-gray-500">
                                Only fill this if {accountName} needs different CTAs or lead triggers than your global defaults.
                            </p>
                        )}
                        <Field label="Standard CTA ({{cta}} in templates)" value={playbookDraft.replyCta} onChange={(v) => setPlaybookDraft({ ...playbookDraft, replyCta: v })} rows={2} />
                        <Field label="Urgent CTA ({{cta_urgent}})" value={playbookDraft.replyCtaUrgent} onChange={(v) => setPlaybookDraft({ ...playbookDraft, replyCtaUrgent: v })} rows={2} />
                        {!isGlobal && (
                            <Field label="Brand override (optional — default is page name)" value={playbookDraft.brandDisplayName || ""} onChange={(v) => setPlaybookDraft({ ...playbookDraft, brandDisplayName: v })} rows={1} />
                        )}
                        <Field
                            label="Lead inquiry triggers (comma-separated — only if this account gets sales leads in comments)"
                            value={(playbookDraft.leadInquiryTriggers || []).join(", ")}
                            onChange={(v) => setPlaybookDraft({
                                ...playbookDraft,
                                leadInquiryTriggers: v.split(",").map((s) => s.trim()).filter(Boolean),
                            })}
                            rows={2}
                        />
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={playbookDraft.neutralLeadsEnabled !== false}
                                onChange={(e) => setPlaybookDraft({ ...playbookDraft, neutralLeadsEnabled: e.target.checked })}
                            />
                            Treat short help/request comments as neutral leads
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            <button type="button" onClick={handleSavePlaybook} disabled={savingPlaybook}
                                className="py-2 px-4 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 disabled:opacity-50">
                                {savingPlaybook ? "Saving…" : isGlobal ? "Save global playbook" : "Save account overrides"}
                            </button>
                            {!isGlobal && playbookMeta?.usesAccountOverrides && (
                                <button type="button" onClick={handleResetAccountPlaybook}
                                    className="py-2 px-4 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
                                    Reset to global
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {!isGlobal && !showAccountCustomize && playbookDraft && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between gap-4">
                        <p className="text-sm text-gray-600">This account uses your global playbook. Brand name comes from the connected page automatically.</p>
                        <button type="button" onClick={() => setShowAccountCustomize(true)}
                            className="shrink-0 text-sm font-semibold text-violet-600 hover:text-violet-800">
                            Customize this account →
                        </button>
                    </div>
                )}

                {/* Categories */}
                <div>
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">
                        {isGlobal ? "Global categories & triggers" : `Effective categories for ${accountName || "account"}`}
                    </h2>
                    {loading ? (
                        <p className="text-gray-400 text-center py-12">Loading…</p>
                    ) : (
                        <div className="space-y-3">
                            {merged.map((entry) => (
                                <div key={`${entry.scope}-${entry.category}`}
                                    className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-violet-200 transition-colors cursor-pointer"
                                    onClick={() => setSelected({
                                        ...entry,
                                        triggers: (entry.triggers || []).join(", "),
                                        exampleComments: (entry.exampleComments || []).join("\n"),
                                    })}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-gray-900">{entry.label || CATEGORY_LABELS[entry.category]}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{entry.category} · threshold {entry.confidenceThreshold}%</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${entry.scope === "account" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                                            {entry.scope === "account" ? "Account override" : "Global"}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">{entry.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <EditModal entry={selected} pageId={pageId} onChange={setSelected}
                    onSave={() => handleSaveEntry(selected)} onClose={() => setSelected(null)} />
            )}
        </div>
    );
}

function EditModal({ entry, pageId, onChange, onSave, onClose }) {
    const set = (key, val) => onChange({ ...entry, [key]: val });
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b flex justify-between items-center">
                    <div>
                        <h2 className="font-bold text-gray-900">Edit: {entry.label}</h2>
                        {pageId && entry.scope === "global" && (
                            <p className="text-xs text-amber-600 mt-1">Saving creates an override for this account only. Edit global (no account selected) to change all accounts.</p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 text-xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <Field label="Description" value={entry.description} onChange={(v) => set("description", v)} />
                    <Field label="Triggers (comma-separated)" value={entry.triggers} onChange={(v) => set("triggers", v)} rows={3} />
                    <Field
                        label="Example comments (one per line — used for similarity matching)"
                        value={entry.exampleComments}
                        onChange={(v) => set("exampleComments", v)}
                        rows={4}
                    />
                    <Field label="Instructions" value={entry.instructions} onChange={(v) => set("instructions", v)} rows={3} />
                    <Field label="Reply Template" value={entry.template} onChange={(v) => set("template", v)} rows={4} />
                    <Field label="Mild / Severe templates (optional)" value={entry.templates?.severe || ""} onChange={(v) => set("templates", { ...entry.templates, severe: v })} rows={2} />
                    <p className="text-xs text-gray-400">{"{{username}} {{issue}} {{brand}} {{cta}} {{cta_urgent}}"}</p>
                </div>
                <div className="px-6 py-4 border-t flex gap-2">
                    <button onClick={onSave} className="flex-1 py-2 bg-violet-600 text-white rounded-xl font-semibold text-sm">Save</button>
                    <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancel</button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, rows = 2 }) {
    return (
        <div>
            <label className="text-xs text-gray-400 uppercase">{label}</label>
            {rows > 1 ? (
                <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)}
                    className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none" />
            ) : (
                <input value={value || ""} onChange={(e) => onChange(e.target.value)}
                    className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            )}
        </div>
    );
}
