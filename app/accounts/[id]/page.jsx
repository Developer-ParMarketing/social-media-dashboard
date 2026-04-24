"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import API from "@/services/api";

/* ── helpers ── */
const tagStyle = (platform) =>
    platform === "instagram"
        ? "bg-pink-100 text-pink-800"
        : "bg-indigo-100 text-indigo-800";

const typeStyle = (type) =>
    ["reel", "video"].includes(type)
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-800";

const fmt = (n) => (n ?? 0).toLocaleString("en-IN");

/* ═══════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════ */
export default function AccountDetails() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const pageToken = searchParams.get("token");

    const [loading, setLoading] = useState(true);
    const [dashboard, setDashboard] = useState(null);
    const [since, setSince] = useState("");
    const [until, setUntil] = useState("");
    const [selectedPost, setSelectedPost] = useState(null);

    const [allComments, setAllComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);

    useEffect(() => {
        if (!id || !pageToken) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const res = await API.get(`/facebook/dashboard/${id}`, {
                    params: {
                        access_token: pageToken,
                        since: since || undefined,
                        until: until || undefined,
                    },
                });
                setDashboard(res.data);
            } catch (err) {
                console.error("Dashboard fetch error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id, pageToken, since, until]);



    useEffect(() => {
        if (!id || !pageToken) return;

        const fetchComments = async () => {
            try {
                setLoadingComments(true);

                const res = await API.get(
                    `/facebook/comments/${id}`,
                    {
                        params: {
                            access_token: pageToken,
                        },
                    }
                );

                const posts = res.data?.data || [];

                // 🔥 flatten comments
                const flat = [];

                posts.forEach((post) => {
                    const id = post.postId || post.mediaId;
                    (post.comments || []).forEach((c) => {
                        flat.push({
                            platform: post.platform,
                            postId: id,
                            message: post.message,

                            // 🔥 handle both FB + IG
                            username: c.username || c.from?.name || "Unknown",
                            text: c.text || c.message || "",
                            timestamp: c.timestamp || c.created_time,
                        });
                    });
                });

                setAllComments(flat);
            } catch (err) {
                console.error("Comments fetch error:", err);
            } finally {
                setLoadingComments(false);
            }
        };

        fetchComments();
    }, [id, pageToken]);


    if (loading)
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
                    <p className="text-gray-500 text-sm">Loading dashboard…</p>
                </div>
            </div>
        );

    if (!dashboard)
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-400">No data available</p>
            </div>
        );

    const fbPosts = (dashboard.data || []).filter((p) => p.platform === "facebook");
    const igPosts = (dashboard.data || []).filter((p) => p.platform === "instagram");

    const bestItems = [
        { title: "Best Facebook overall", post: dashboard.bestOverall },
        { title: "Best FB post", post: dashboard.bestByCategory?.post },
        { title: "Best FB reel", post: dashboard.bestByCategory?.reel },
        { title: "Best Instagram overall", post: dashboard.instagram?.best?.overall },
        { title: "Best IG post", post: dashboard.instagram?.best?.post },
        { title: "Best IG reel", post: dashboard.instagram?.best?.reel },
    ].filter((i) => i.post);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
            <div className="max-w-7xl mx-auto space-y-10">
                {/* HERO */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8 rounded-3xl">
                    <h1 className="text-3xl md:text-4xl font-bold mb-6">{dashboard.page.name}</h1>
                    <div className="flex flex-wrap gap-10">
                        <HeroStat label="Facebook followers" value={fmt(dashboard.page.followers)} />
                        {dashboard.instagram?.profile && (
                            <HeroStat label="Instagram followers" value={fmt(dashboard.instagram.profile.followers_count)} />
                        )}
                    </div>
                </div>

                {/* FILTER BAR */}
                {/* <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row gap-5 items-end">
                    <FilterField label="From date" value={since} onChange={(e) => setSince(e.target.value)} />
                    <FilterField label="To date" value={until} onChange={(e) => setUntil(e.target.value)} />
                    <button
                        onClick={() => { setSince(""); setUntil(""); }}
                        className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition whitespace-nowrap"
                    >
                        Reset filters
                    </button>
                </div> */}

                {/* SUMMARY STATS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Total content" value={fmt(dashboard.summary?.totalContent)} />
                    <StatCard title="Total likes" value={fmt(dashboard.summary?.totalLikes)} />
                    <StatCard title="Total comments" value={fmt(dashboard.summary?.totalComments)} />
                    <StatCard title="Total engagement" value={fmt(dashboard.summary?.totalEngagement)} />
                </div>

                {/* TOP PERFORMING CONTENT - Grid with Scroll */}
                {bestItems.length > 0 && (
                    <GridSection
                        title="🏆 Top performing content"
                        posts={bestItems.map((b) => ({ ...b.post, _sectionLabel: b.title }))}
                        onCardClick={setSelectedPost}
                        section="best"
                    />
                )}

                {/* FACEBOOK POSTS - Grid with Scroll */}
                {fbPosts.length > 0 && (
                    <GridSection
                        title={`📘 Facebook posts & reels (${fbPosts.length})`}
                        posts={fbPosts}
                        onCardClick={setSelectedPost}
                        section="facebook"
                    />
                )}

                {/* INSTAGRAM POSTS - Grid with Scroll */}
                {igPosts.length > 0 && (
                    <GridSection
                        title={`📷 Instagram posts & reels (${igPosts.length})`}
                        posts={igPosts}
                        onCardClick={setSelectedPost}
                        section="instagram"
                    />
                )}

                {/* MONTHLY TABLE */}
                <MonthlyTable data={dashboard.monthly || []} />
                {loadingComments ? (
                    <div className="text-center py-10 text-gray-500">
                        Loading comments...
                    </div>
                ) : (
                    <CommentsTable data={allComments} />
                )}
            </div>

            {selectedPost && <Modal post={selectedPost} onClose={() => setSelectedPost(null)} />}
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   GRID SECTION (Used for ALL sections now)
═══════════════════════════════════════════════════ */
function GridSection({ title, posts, onCardClick, section }) {
    return (
        <div>
            <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-5">{title}</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <div className="max-h-[620px] overflow-y-auto pr-4 custom-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posts.map((post, index) => (
                        <PostCard
                            key={`${section}-${post.id}-${index}`}  // ✅ now works
                            post={post}
                            sectionLabel={post._sectionLabel}
                            onClick={onCardClick}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   POST CARD
═══════════════════════════════════════════════════ */
function PostCard({ post, sectionLabel, onClick }) {
    const isVideo = ["reel", "video"].includes(post.type);
    const mediaUrl =
        post.image ||
        (post.platform === "facebook" && isVideo
            ? `https://graph.facebook.com/${post.id}/picture?type=large`
            : null);

    const date = new Date(post.created_time).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    return (
        <div
            onClick={() => onClick(post)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full"
        >
            {/* Media */}
            <div className="relative aspect-[4/3] bg-zinc-900 flex-shrink-0 overflow-hidden">
                {mediaUrl ? (
                    <img
                        src={mediaUrl}
                        alt="Post media"
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                        onError={(e) => (e.target.style.display = "none")}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-xs">No media</div>
                )}
                {isVideo && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-12 h-12 bg-white/90 rounded-xl flex items-center justify-center shadow-lg">
                            <span className="text-red-600 text-2xl ml-1">▶</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col flex-1">
                {sectionLabel && (
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                        {sectionLabel}
                    </p>
                )}
                <div className="flex gap-2 mb-3">
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${tagStyle(post.platform)}`}>
                        {post.platform}
                    </span>
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full capitalize ${typeStyle(post.type)}`}>
                        {post.type}
                    </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3 flex-1 leading-relaxed">
                    {post.message || "No caption available"}
                </p>
                <div className="flex justify-between text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                    <div className="flex gap-3">
                        <span>👍 {fmt(post.likes)}</span>
                        <span>💬 {fmt(post.comments)}</span>
                        {post.views > 0 && <span>👀 {fmt(post.views)}</span>}
                    </div>
                    <span>{date}</span>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   MONTHLY TABLE + MODAL + ATOMS
═══════════════════════════════════════════════════ */
function MonthlyTable({ data }) {
    return (
        <div>
            <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
                📅 Monthly performance
            </h2>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">

                {/* SCROLL BOX */}
                <div className="max-h-[400px] overflow-y-auto overflow-x-auto">

                    <table className="w-full text-sm min-w-[780px]">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                            <tr>
                                {["Month", "FB posts", "FB likes", "FB reach", "IG posts", "IG likes", "IG reach", "Total engagement"].map((h, i) => (
                                    <th key={h} className={`px-5 py-3 ${i === 0 ? "text-left" : "text-center"}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {data.map((m, i) => (
                                <tr key={i} className="border-t hover:bg-gray-50">
                                    <td className="px-5 py-4 font-medium">{m.month}</td>
                                    <td className="text-center">{m.facebook?.posts ?? 0}</td>
                                    <td className="text-center">{fmt(m.facebook?.likes)}</td>
                                    <td className="text-center">{fmt(m.facebook?.reach)}</td>
                                    <td className="text-center">{m.instagram?.posts ?? 0}</td>
                                    <td className="text-center">{fmt(m.instagram?.likes)}</td>
                                    <td className="text-center">{fmt(m.instagram?.reach)}</td>
                                    <td className="text-center font-semibold text-indigo-600">
                                        {fmt((m.facebook?.engagement ?? 0) + (m.instagram?.engagement ?? 0))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                </div>
            </div>
        </div>
    );
}

function CommentsTable({ data }) {
    return (
        <div>
            <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
                💬 All Comments
            </h2>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">

                {/* SCROLL CONTAINER */}
                <div className="max-h-[500px] overflow-y-auto overflow-x-auto">

                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                            <tr>
                                <th className="px-4 py-3 text-left">Platform</th>
                                <th className="px-4 py-3 text-left">Post ID</th>
                                <th className="px-4 py-3 text-left">Username</th>
                                <th className="px-4 py-3 text-left">Comment</th>
                                <th className="px-4 py-3 text-left">Date</th>
                            </tr>
                        </thead>

                        <tbody>
                            {data.map((c, i) => (
                                <tr key={i} className="border-t hover:bg-gray-50">
                                    <td className="px-4 py-3 capitalize">{c.platform}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500">{c.postId}</td>
                                    <td className="px-4 py-3 font-medium">{c.username}</td>
                                    <td className="px-4 py-3">{c.text}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500">
                                        {new Date(c.timestamp).toLocaleString("en-IN")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                </div>
            </div>
        </div>
    );
}

function Modal({ post, onClose }) {
    const isVideo = ["reel", "video"].includes(post.type);

    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const stats = [
        { label: "Likes", value: fmt(post.likes) },
        { label: "Comments", value: fmt(post.comments) },
        ...(post.views > 0 ? [{ label: "Views", value: fmt(post.views) }] : []),
        ...(post.reach > 0 ? [{ label: "Reach", value: fmt(post.reach) }] : []),
    ];

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-3xl w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative bg-black flex-shrink-0 flex items-center justify-center" style={{ maxHeight: "55vh" }}>
                    {isVideo ? (
                        <video src={post.image} controls autoPlay className="w-full max-h-[55vh] object-contain" />
                    ) : (post.image || post.media_url) ? (
                        <img src={post.image || post.media_url} alt="Post media" className="w-full max-h-[55vh] object-contain" onError={(e) => (e.target.style.display = "none")} />
                    ) : (
                        <div className="py-12 px-8 text-gray-400 text-sm">No media available</div>
                    )}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-700 text-sm font-medium px-4 py-2 rounded-xl shadow transition"
                    >
                        ✕ Close
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    <div className="flex gap-3">
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider ${tagStyle(post.platform)}`}>{post.platform}</span>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider capitalize ${typeStyle(post.type)}`}>{post.type}</span>
                    </div>

                    <p className="text-gray-700 text-[15px] leading-relaxed">{post.message || "No caption provided"}</p>

                    <div className={`grid gap-4 ${stats.length >= 3 ? "grid-cols-4" : `grid-cols-${Math.min(stats.length, 4)}`}`}>
                        {stats.map((s) => (
                            <div key={s.label} className="bg-gray-50 rounded-2xl p-4 text-center">
                                <p className="text-2xl font-bold text-indigo-600">{s.value}</p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const HeroStat = ({ label, value }) => (
    <div>
        <p className="text-sm opacity-80 mb-1">{label}</p>
        <p className="text-3xl md:text-4xl font-bold">{value}</p>
    </div>
);

const FilterField = ({ label, value, onChange }) => (
    <div className="flex-1 min-w-[140px]">
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <input
            type="date"
            value={value}
            onChange={onChange}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
        />
    </div>
);

const StatCard = ({ title, value }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{title}</p>
        <p className="text-3xl md:text-4xl font-bold text-gray-900">{value}</p>
    </div>
);