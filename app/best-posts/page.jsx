"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";

export default function BestPosts() {
    const [posts, setPosts] = useState([]);

    useEffect(() => {
        API.get("/instagram/best-posts").then((res) => {
            setPosts(res.data);
        });
    }, []);

    const formatCaption = (text) => {
        if (!text) return "";
        return text.replace(/\n/g, " ");
    };

    const getEngagementRate = (post) => {
        if (!post.reach || post.reach === 0) return 0;
        return ((post.engagement || 0) / post.reach) * 100;
    };

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl font-semibold mb-6 text-black">
                Top Performing Posts
            </h1>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                {posts.map((post) => (
                    <div
                        key={post.id}
                        className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition"
                    >
                        {/* MEDIA */}
                        <div className="w-full h-52 bg-black">
                            {post.media_type === "VIDEO" ? (
                                <video
                                    src={post.media_url}
                                    controls
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <img
                                    src={post.media_url}
                                    alt="media"
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>

                        {/* CONTENT */}
                        <div className="p-4">
                            <p className="text-sm text-gray-600 line-clamp-3">
                                {formatCaption(post.caption)}
                            </p>

                            {/* STATS */}
                            <div className="mt-3 text-sm space-y-1 text-gray-700">
                                <p>Likes: {post.like_count}</p>
                                <p>Comments: {post.comments_count}</p>
                                <p>Shares: {post.shares}</p>
                                <p>Saves: {post.saved}</p>
                                <p>Reach: {post.reach}</p>

                                <p className="font-semibold text-blue-600">
                                    Engagement Rate:{" "}
                                    {getEngagementRate(post).toFixed(2)}%
                                </p>

                                <p className="font-semibold text-green-600">
                                    Score: {post.score?.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}