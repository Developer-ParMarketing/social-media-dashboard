"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";
import Table from "@/components/Table";
import Modal from "@/components/Modal";

export default function InstagramPage() {
    const [media, setMedia] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        API.get("/instagram/media")
            .then((res) => setMedia(res.data))
            .catch((err) => console.error(err));
    }, []);

    const handleInsights = async (row) => {
        if (!row?.id) return;

        try {
            setLoading(true);
            const res = await API.get(`/instagram/media-insights/${row.id}`);
            setInsights(res.data);
            setModalOpen(true);
        } catch (err) {
            console.error(err);
            alert("Failed to fetch insights");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 bg-gray-100 min-h-screen">

            <h2 className="text-2xl font-bold mb-4 text-black">
                📸 Instagram Media
            </h2>

            <div className="bg-white p-4 rounded-2xl shadow">
                <Table data={media} onAction={handleInsights} />
            </div>

            {/* Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                data={insights}
            />

            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/30 text-white">
                    Loading...
                </div>
            )}
        </div>
    );
}